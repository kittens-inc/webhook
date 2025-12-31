/**
 * Cryptographic utilities for webhook verification
 */
export class CryptoUtils {
  /**
   * Verify GitHub webhook signature
   */
  public static async verifyGitHubSignature(
    signature: string,
    payload: string,
    secret: string
  ): Promise<boolean> {
    try {
      // Remove 'sha256=' prefix from signature
      const signatureBuffer = this.hexToBuffer(signature.replace("sha256=", ""));
      
      // Create HMAC key
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: { name: "SHA-256" } },
        false,
        ["verify"]
      );

      // Verify signature
      return await crypto.subtle.verify(
        "HMAC",
        key,
        signatureBuffer,
        new TextEncoder().encode(payload)
      );
    } catch (error) {
      console.error("Signature verification failed:", error);
      return false;
    }
  }

  /**
   * Convert hex string to buffer
   */
  private static hexToBuffer(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }
}
