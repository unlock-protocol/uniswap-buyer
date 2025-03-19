import { CurrencyAmount, Percent, Token, TradeType } from "@uniswap/sdk-core";
import { Pool, Route, Trade, SwapRouter } from "@uniswap/v3-sdk";
import { ethers } from "ethers";
import IUniswapV3PoolABI from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import QUOTER_ABI from "./ABI/quoter.ts";
import SWAP_ROUTER_ABI from "./ABI/swapRouter2.ts";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const wallet = new ethers.Wallet(process.env.PKEY!, provider);

const POOL_ADDRESS = "0x9EF81F4E2F2f15Ff1c0C3f8c9ECc636580025242";
const QUOTER_ADDRESS = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const SWAP_ROUTER_ADDRESS = "0x2626664c2603336E57B271c5C0b26F421741e481";

const SLIPPAGE = new Percent(50, 10_000);
const DEADLINE_DELAY = 60 * 2; // 2 minutes

// Util function to build @uniswap/v3-sdk Pool object from an address
async function getPool(address: string) {
  const poolContract = new ethers.Contract(
    address,
    IUniswapV3PoolABI.abi,
    provider,
  );

  const [token0, token1, fee, liquidity, slot0] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  const token0Token = await getToken(token0);
  const token1Token = await getToken(token1);

  return {
    pool: new Pool(
      token0Token,
      token1Token,
      Number(fee),
      slot0[0].toString(),
      liquidity.toString(),
      Number(slot0[1]),
    ),
    token0Token,
    token1Token,
  };
}

// Util function to build @uniswap/sdk-core object from an address
async function getToken(address: string) {
  const contract = new ethers.Contract(
    address,
    [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint256)",
      "function name() view returns (string)",
    ],
    provider,
  );
  const [symbol, decimals, name] = await Promise.all([
    contract.symbol(),
    contract.decimals(),
    contract.name(),
  ]);

  return new Token(8435, address, Number(decimals), symbol, name);
}

// Util function to get a quote for a swap
async function getQuote(
  amountIn: BigInt,
  tokenIn: Token,
  tokenOut: Token,
  fee: number,
) {
  const contract = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, provider);

  const quoteParam = {
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    fee,
    amountIn,
    amount: "0",
    sqrtPriceLimitX96: 0,
  };

  const quote = await contract.quoteExactInputSingle.staticCall(quoteParam);
  return quote[0];
}

// Util function to generate swap transaction
async function generateSwapTxn(amount: string) {
  const {
    pool,
    token0Token: WETH,
    token1Token: UP,
  } = await getPool(POOL_ADDRESS);

  const swapRoute = new Route([pool], WETH, UP);
  const amountIn: BigInt = ethers.parseUnits(amount, WETH.decimals);

  // Get amount for quote!
  const amountOut: BigInt = await getQuote(amountIn, WETH, UP, pool.fee);

  const wethContract = new ethers.Contract(
    WETH.address,
    [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address, address) view returns (uint256)",
      "function approve(address, uint256) external",
      "function deposit(uint256) payable external",
    ],
    wallet,
  );

  // Check WETH balance!
  let deposit;
  const balance = await wethContract.balanceOf(wallet.address);
  if (balance < amountIn) {
    deposit = {
      to: WETH.address,
      data: wethContract.interface.encodeFunctionData("deposit", [amountIn]),
      value: amountIn,
    };
  }

  // Check approval!
  const approved = await wethContract.allowance(
    wallet.address,
    SWAP_ROUTER_ADDRESS,
  );
  let approval;
  if (approved < amountIn) {
    approval = {
      to: WETH.address,
      data: wethContract.interface.encodeFunctionData("approve", [
        SWAP_ROUTER_ADDRESS,
        amountIn,
      ]),
    };
  }

  const uncheckedTrade = Trade.createUncheckedTrade({
    route: swapRoute,
    inputAmount: CurrencyAmount.fromRawAmount(WETH, amountIn.toString()),
    outputAmount: CurrencyAmount.fromRawAmount(UP, amountOut.toString()),
    tradeType: TradeType.EXACT_INPUT,
  });

  const { calldata: swapData, value: swapValue } =
    SwapRouter.swapCallParameters([uncheckedTrade], {
      slippageTolerance: SLIPPAGE,
      deadline: Math.floor(Date.now() / 1000) + DEADLINE_DELAY,
      recipient: await wallet.getAddress(),
    });

  const { args } = SwapRouter.INTERFACE.parseTransaction({
    value: swapValue,
    data: swapData,
  });

  const contract = new ethers.Contract(
    SWAP_ROUTER_ADDRESS,
    SWAP_ROUTER_ABI,
    wallet,
  );
  const params = {
    tokenIn: args[0].tokenIn,
    tokenOut: args[0].tokenOut,
    fee: args[0].fee,
    recipient: args[0].recipient,
    deadline: args[0].deadline.toString(),
    amountIn: args[0].amountIn.toString(),
    amountOutMinimum: args[0].amountOutMinimum.toString(),
    sqrtPriceLimitX96: 0,
  };

  const swap = {
    to: SWAP_ROUTER_ADDRESS,
    data: contract.interface.encodeFunctionData("exactInputSingle", [params]),
  };

  return {
    deposit,
    approval,
    swap,
  };
}

const run = async () => {
  const eth = "0.001";
  const { deposit, approval, swap } = await generateSwapTxn(eth);

  if (deposit) {
    await (await wallet.sendTransaction(deposit)).wait();
  }

  if (approval) {
    await (await wallet.sendTransaction(approval)).wait();
  }

  const res = await wallet.sendTransaction(swap);
  console.log(res);
};

run();
