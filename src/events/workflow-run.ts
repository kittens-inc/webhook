import { Event, EventType, type WorkflowRunPayload } from "../types";
import { Config } from "../config";
import { Webhook } from "../utils/webhook";

/**
 * Workflow Run Event Handler
 */
export class WorkflowRunEvent extends Event {
  constructor() {
    super({
      name: "WorkflowRunEvent",
      events: [EventType.WORKFLOW_RUN],
    });
  }

  public async execute(payload: WorkflowRunPayload): Promise<void> {
    // Check if workflow_run events are enabled
    if (!Config.get<boolean>("events", "workflow_run")) {
      return;
    }

    const config = Config.get("events_config", "workflow_run");
    const { action, workflow_run, repository, sender } = payload;

    // Only process completed workflows for now
    if (action !== "completed") {
      return;
    }

    // Get status text
    const statusText = this.getStatusText(workflow_run.conclusion);

    // Build description
    const description = [
      `Workflow **${workflow_run.name}** ${statusText} in [\`${repository.full_name}\`](${repository.html_url})`,
      "",
    ];

    // Build embed fields
    const fields = [];

    // Add conclusion if enabled
    if (config.show_conclusion && workflow_run.conclusion) {
      fields.push({
        name: "Result",
        value: `${Webhook.getStatusText(workflow_run.conclusion)}`,
        inline: true,
      });
    }

    // Add duration if enabled
    if (config.show_duration && workflow_run.run_started_at && workflow_run.updated_at) {
      const duration = Webhook.formatDuration(
        workflow_run.run_started_at,
        workflow_run.updated_at
      );

      fields.push({
        name: "Duration",
        value: duration,
        inline: true,
      });
    }

    // Add workflow ID
    fields.push({
      name: "Run ID",
      value: `#${workflow_run.id}`,
      inline: true,
    });

    // Determine embed color based on conclusion
    let embedColor = config.embed_color;
    if (workflow_run.conclusion === "success") {
      embedColor = 0x28a745; // Green
    } else if (workflow_run.conclusion === "failure") {
      embedColor = 0xdc3545; // Red
    } else if (workflow_run.conclusion === "cancelled") {
      embedColor = 0x6c757d; // Gray
    }

    // Send Discord embed
    await Webhook.send({
      title: `Workflow ${workflow_run.name} (${repository.full_name})`,
      description: [
        `>>> Workflow **${workflow_run.name}** ${statusText} in [\`${repository.full_name}\`](https://github.com/${repository.full_name})`,
        "```diff",
        workflow_run.conclusion === "success" ? "+ Workflow completed successfully" : workflow_run.conclusion === "failure" ? "- Workflow failed" : `! Workflow ${workflow_run.conclusion}`,
        workflow_run.run_started_at && workflow_run.updated_at ? `! Duration: ${Webhook.formatDuration(workflow_run.run_started_at, workflow_run.updated_at)}` : "",
        "```"
      ].filter(line => line !== "").join("\n"),
      color: embedColor,
      fields: [
        {
          name: `\`${workflow_run.name}\``,
          value: `\`\`\`fix\n${statusText}\n\`\`\``,
          inline: false
        }
      ],
      ...Webhook.getDefaults(sender),
    });
  }

  private getStatusText(conclusion?: string): string {
    switch (conclusion) {
      case "success":
        return "succeeded";
      case "failure":
        return "failed";
      case "cancelled":
        return "was cancelled";
      case "skipped":
        return "was skipped";
      default:
        return "completed";
    }
  }
}
