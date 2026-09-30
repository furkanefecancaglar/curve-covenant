export async function rpcDeadline<T>(operation: Promise<T>, milliseconds = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The RPC request timed out.')), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}
