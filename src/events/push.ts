import { Event, EventType, type PushPayload } from "../types";
import { Config } from "../config";
import { Webhook } from "../utils/webhook";

/**
 * Push Event Handler
 */
export class PushEvent extends Event {
  constructor() {
    super({
      name: "PushEvent",
      events: [EventType.PUSH],
    });
  }

  public async execute(payload: PushPayload): Promise<void> {
    // Check if push events are enabled
    if (!Config.get<boolean>("events", "push")) {
      return;
    }

    const config = Config.get("events_config", "push");
    const { ref, repository, commits, sender } = payload;

    // Extract branch name from ref
    const branch = ref.replace("refs/heads/", "");

    // Calculate file changes if enabled
    let fileChanges = { added: [] as string[], removed: [] as string[], modified: [] as string[] };
    if (config.show_file_changes) {
      fileChanges = commits.reduce(
        (acc: { added: string[]; removed: string[]; modified: string[] }, commit: any) => ({
          added: [...acc.added, ...commit.added],
          removed: [...acc.removed, ...commit.removed],
          modified: [...acc.modified, ...commit.modified],
        }),
        { added: [] as string[], removed: [] as string[], modified: [] as string[] }
      );
    }

    // Limit commits shown
    const commitsToShow = commits.slice(0, config.max_commits_shown);
    const hasMoreCommits = commits.length > config.max_commits_shown;

    // Build embed fields for commits
    const fields = [];
    if (config.show_commit_details) {
      for (const commit of commitsToShow) {
        const commitMessage = Webhook.truncate(commit.message, 100);
        const shortSha = commit.id.substring(0, 7);

        fields.push({
          name: `\`${shortSha}\` by ${commit.author.name}`,
          value: `\`\`\`\n${commitMessage}\n\`\`\``,
          inline: false,
        });
      }

      if (hasMoreCommits) {
        fields.push({
          name: "More commits",
          value: `... and ${commits.length - config.max_commits_shown} more commits`,
          inline: false,
        });
      }
    }

    // Send Discord embed
    await Webhook.send({
      title: `Commit to ${repository.full_name} (${branch})`,
      description: [
        `>>> There's been **${commits.length}** ${commits.length === 1 ? "commit" : "commits"} to [\`${repository.full_name}\`](https://github.com/${repository.full_name})`,
        "```diff",
        fileChanges.added.length > 0 ? `+ Added ${fileChanges.added.length} ${fileChanges.added.length === 1 ? "file" : "files"}` : "",
        fileChanges.removed.length > 0 ? `- Deleted ${fileChanges.removed.length} ${fileChanges.removed.length === 1 ? "file" : "files"}` : "",
        fileChanges.modified.length > 0 ? `! Modified ${fileChanges.modified.length} ${fileChanges.modified.length === 1 ? "file" : "files"}` : "",
        "```"
      ].filter(line => line !== "").join("\n"),
      color: config.embed_color,
      fields: commits.map((commit: any) => ({
        name: `\`${commit.id.slice(0, 8)}\``,
        value: `\`\`\`fix\n${commit.message.slice(0, 50 - 3)}${commit.message.length > 50 ? "..." : ""}\n\`\`\``,
        inline: commit.message.length < 50
      })),
      ...Webhook.getDefaults(sender)
    });
  }
}
