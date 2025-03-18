import { CurrencyAmount, Percent, Token, TradeType } from "@uniswap/sdk-core";
import { Pool, Route, Trade, SwapRouter } from "@uniswap/v3-sdk";
import { ethers } from "ethers";
import IUniswapV3PoolABI from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";

const PRIVATE_KEY = process.env.PKEY!; // 🚨 Keep secure
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const QUOTER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_factory", type: "address" },
      { internalType: "address", name: "_WETH9", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "WETH9",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "factory",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "path", type: "bytes" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
    ],
    name: "quoteExactInput",
    outputs: [
      { internalType: "uint256", name: "amountOut", type: "uint256" },
      {
        internalType: "uint160[]",
        name: "sqrtPriceX96AfterList",
        type: "uint160[]",
      },
      {
        internalType: "uint32[]",
        name: "initializedTicksCrossedList",
        type: "uint32[]",
      },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          {
            internalType: "uint160",
            name: "sqrtPriceLimitX96",
            type: "uint160",
          },
        ],
        internalType: "struct IQuoterV2.QuoteExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { internalType: "uint256", name: "amountOut", type: "uint256" },
      { internalType: "uint160", name: "sqrtPriceX96After", type: "uint160" },
      {
        internalType: "uint32",
        name: "initializedTicksCrossed",
        type: "uint32",
      },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "path", type: "bytes" },
      { internalType: "uint256", name: "amountOut", type: "uint256" },
    ],
    name: "quoteExactOutput",
    outputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      {
        internalType: "uint160[]",
        name: "sqrtPriceX96AfterList",
        type: "uint160[]",
      },
      {
        internalType: "uint32[]",
        name: "initializedTicksCrossedList",
        type: "uint32[]",
      },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          {
            internalType: "uint160",
            name: "sqrtPriceLimitX96",
            type: "uint160",
          },
        ],
        internalType: "struct IQuoterV2.QuoteExactOutputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactOutputSingle",
    outputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint160", name: "sqrtPriceX96After", type: "uint160" },
      {
        internalType: "uint32",
        name: "initializedTicksCrossed",
        type: "uint32",
      },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "int256", name: "amount0Delta", type: "int256" },
      { internalType: "int256", name: "amount1Delta", type: "int256" },
      { internalType: "bytes", name: "path", type: "bytes" },
    ],
    name: "uniswapV3SwapCallback",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
];

const POOL_ADDRESS = "0x9EF81F4E2F2f15Ff1c0C3f8c9ECc636580025242";
const QUOTER_ADDRESS = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const SWAP_ROUTER_ADDRESS = "0x2626664c2603336E57B271c5C0b26F421741e481";

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

  // Check approval!
  const wethContract = new ethers.Contract(
    WETH.address,
    [
      "function allowance(address, address) view returns (uint256)",
      "function approve(address, uint256) external",
    ],
    wallet,
  );
  const approved = await wethContract.allowance(
    wallet.address,
    SWAP_ROUTER_ADDRESS,
  );
  let approval;
  if (approved < amountIn) {
    approval = {
      to: WETH.address,
      value: "0",
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
      slippageTolerance: new Percent(50, 10_000), // 50 bips, or 0.50%
      deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from the current Unix time
      recipient: await wallet.getAddress(),
    });

  return {
    approval,
    swap: {
      to: SWAP_ROUTER_ADDRESS,
      value: swapValue,
      data: swapData,
    },
  };
}

const run = async () => {
  const eth = "0.001";
  const { approval, swap } = await generateSwapTxn(eth);

  if (approval) {
    await (await wallet.sendTransaction(approval)).wait();
  }

  const res = await wallet.sendTransaction(swap);
  console.log(res);
};

run();
