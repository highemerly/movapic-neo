export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const sharp = (await import("sharp")).default;
    sharp.cache(false);
  }
}
