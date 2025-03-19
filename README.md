# Uniswap token buyer

This project is an example of a script that can be used to buy UP tokens from Uniswap.

```bash

# Install dependencies
yarn

# Set env variables
export PKEY=<your private key>
export RPC_URL=<Base RPC URL>

# Run
yarn run start
```

The script will wrap ETH into WETH if needed, add an allowance for the Uniswap Swap Router address on Base, and make the swap, based on the current price.
