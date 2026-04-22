import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const defaultRpc = 'https://ethereum-sepolia-rpc.publicnode.com'

export const sepoliaRpcUrl =
  import.meta.env.VITE_SEPOLIA_RPC_URL?.trim() || defaultRpc

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(sepoliaRpcUrl),
})
