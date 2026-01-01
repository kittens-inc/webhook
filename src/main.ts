import { Config } from "./config";
import { Logger } from "./utils/logger";
import { CryptoUtils } from "./utils/crypto";
import { eventManager } from "./managers/event-manager";
import { PushEvent, IssuesEvent, WorkflowRunEvent, WorkflowJobEvent } from "./events";
import { EventType, type AppConfig } from "./types";

/**
 * Main Webhook Server
 */
class WebhookServer {
  private server: Bun.Server<undefined> | null = null;
  private readonly secret: string;
  private readonly port: number;

  constructor(secret: string, port: number) {
    this.secret = secret;
    this.port = port;
  }

  /**
   * Handle incoming webhook requests
   */
  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    // GitHub webhook endpoint
    if (url.pathname === "/github" && req.method === "POST") {
      return await this.handleGitHubWebhook(req);
    }

    // 404 for other routes
    return new Response("Not Found", { status: 404 });
  }

  /**
   * Handle GitHub webhook requests
   */
  private async handleGitHubWebhook(req: Request): Promise<Response> {
    try {
      // Validate content type
      const contentType = req.headers.get("Content-Type");
      if (contentType !== "application/json") {
        Logger.warn("Invalid content type received");
        return new Response("Invalid content type", { status: 400 });
      }

      // Get event type
      const eventType = req.headers.get("X-GitHub-Event") as EventType;
      if (!eventType) {
        Logger.warn("Missing X-GitHub-Event header");
        return new Response("Missing event type", { status: 400 });
      }

      // Get request body
      const body = await req.text();

      // Verify signature if secret is configured
      if (this.secret) {
        const signature = req.headers.get("X-Hub-Signature-256");
        if (!signature) {
          Logger.warn("Missing signature header");
          return new Response("Missing signature", { status: 401 });
        }

        const isValid = await CryptoUtils.verifyGitHubSignature(
          signature,
          body,
          this.secret
        );

        if (!isValid) {
          Logger.error("Invalid webhook signature");
          return new Response("Invalid signature", { status: 401 });
        }
      }

      // Parse JSON payload
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        Logger.error(`Failed to parse JSON payload: ${error}`);
        return new Response("Invalid JSON", { status: 400 });
      }

      // Debug logging
      if (Config.get<boolean>("app", "debug")) {
        const timestamp = new Date().getTime();
        Logger.debug(`Received ${eventType} event (${eventType}-${timestamp})`);

        // Save payload to file for debugging
        try {
          await Bun.write(`./debug/${eventType}-${timestamp}.json`, JSON.stringify(payload, null, 2));
        } catch (error) {
          // Ignore file write errors in debug mode
        }
      }

      // Emit event to handlers
      await eventManager.emit(eventType, payload);

      return new Response("OK", { status: 202 });
    } catch (error) {
      Logger.error(`Webhook processing failed: ${error}`);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      this.server = Bun.serve({
        port: this.port,
        fetch: this.handleRequest.bind(this),
        error: (error: Error) => {
          Logger.error(`Server error: ${error.message}`);
          return new Response("Internal Server Error", { status: 500 });
        },
      });

      Logger.log(`Webhook server started on http://localhost:${this.port}`);
      Logger.log(`GitHub webhook endpoint: http://localhost:${this.port}/github`);
      Logger.log(`Health check endpoint: http://localhost:${this.port}/health`);
    } catch (error) {
      Logger.error(`Failed to start server: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      Logger.log("Server stopped");
    }
  }
}

/**
 * Main application entry point
 */
async function main() {
  try {
    // Determine config file
    const configFile = process.env.CONFIG ||
      (process.env.NODE_ENV === "development" ? "config.dev.toml" : "config.toml");

    // Load configuration
    await Config.load(configFile);
    Logger.log(`Loaded ${Object.keys(Config.get<AppConfig>()).length} configuration sections`);

    // Create debug directory if debug mode is enabled
    if (Config.get<boolean>("app", "debug")) {
      try {
        await Bun.write("./debug/.gitkeep", "");
      } catch (error) {
        // Ignore directory creation errors
      }
    }

    // Register event handlers
    const events = [
      new PushEvent(),
      new IssuesEvent(),
      new WorkflowRunEvent(),
      new WorkflowJobEvent(),
    ];

    eventManager.register(events);
    Logger.log(`Registered ${events.length} event handlers`);

    // Get server configuration
    const port = Config.get<number>("app", "port");
    const secret = Config.get<string>("github", "secret");

    if (!secret) {
      Logger.warn("No GitHub webhook secret configured - signature verification disabled");
    }

    // Start server
    const server = new WebhookServer(secret, port);
    await server.start();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      Logger.log("Received SIGINT, shutting down gracefully...");
      await server.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      Logger.log("Received SIGTERM, shutting down gracefully...");
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    Logger.error(`Application startup failed: ${error}`);
    process.exit(1);
  }
}

// Start the application
if (import.meta.main) {
  main();
}
