import * as TOML from "@iarna/toml";
import { readFileSync, existsSync } from "fs";
import type { AppConfig } from "../types";
import { Logger } from "../utils/logger";

/**
 * Configuration Manager
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from TOML file
   */
  public async load(configPath: string): Promise<void> {
    try {
      if (!existsSync(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      const configContent = readFileSync(configPath, "utf-8");
      const parsedConfig = TOML.parse(configContent) as any;

      // Validate and set defaults
      this.config = this.validateConfig(parsedConfig);
      
      Logger.log(`Loaded configuration from ${configPath}`);
    } catch (error) {
      Logger.error(`Failed to load configuration: ${error}`);
      throw error;
    }
  }

  /**
   * Get configuration value
   */
  public get<T = any>(section?: string, key?: string): T {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call load() first.");
    }

    if (!section) {
      return this.config as T;
    }

    const sectionData = (this.config as any)[section];
    if (!sectionData) {
      throw new Error(`Configuration section '${section}' not found`);
    }

    if (!key) {
      return sectionData as T;
    }

    const value = sectionData[key];
    if (value === undefined) {
      throw new Error(`Configuration key '${section}.${key}' not found`);
    }

    return value as T;
  }

  /**
   * Check if configuration is loaded
   */
  public isLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Validate and apply defaults to configuration
   */
  private validateConfig(config: any): AppConfig {
    const defaultConfig: AppConfig = {
      app: {
        debug: false,
        port: 3000,
      },
      github: {
        secret: "",
      },
      discord: {
        webhook_url: "",
      },
      events: {
        push: true,
        issues: true,
        workflow_run: true,
        workflow_job: true,
      },
      events_config: {
        push: {
          show_file_changes: true,
          max_commits_shown: 5,
          show_commit_details: true,
          embed_color: 0x00ff00, // Green
        },
        issues: {
          show_labels: true,
          show_assignees: true,
          embed_color: 0xff9900, // Orange
        },
        workflow_run: {
          show_duration: true,
          show_conclusion: true,
          embed_color: 0x0099ff, // Blue
        },
        workflow_job: {
          show_steps: false,
          show_runner: true,
          embed_color: 0x6600cc, // Purple
        },
      },
    };

    // Deep merge with defaults
    return this.deepMerge(defaultConfig, config);
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

// Export singleton instance
export const Config = ConfigManager.getInstance();
