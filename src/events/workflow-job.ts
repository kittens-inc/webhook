import { Event, EventType, type WorkflowJobPayload } from "../types";
import { Config } from "../config";
import { Webhook } from "../utils/webhook";

/**
 * Workflow Job Event Handler
 */
export class WorkflowJobEvent extends Event {
  constructor() {
    super({
      name: "WorkflowJobEvent",
      events: [EventType.WORKFLOW_JOB],
    });
  }

  public async execute(payload: WorkflowJobPayload): Promise<void> {
    // Check if workflow_job events are enabled
    if (!Config.get<boolean>("events", "workflow_job")) {
      return;
    }

    const config = Config.get("events_config", "workflow_job");
    const { action, workflow_job, repository, sender } = payload;

    // Only process completed jobs for now
    if (action !== "completed") {
      return;
    }

    // Get status text
    const statusText = this.getStatusText(workflow_job.conclusion);

    // Build description
    const description = [
      `Job **${workflow_job.name}** ${statusText} in [\`${repository.full_name}\`](${repository.html_url})`,
      "",
    ];

    // Build embed fields
    const fields = [];

    // Add conclusion
    if (workflow_job.conclusion) {
      fields.push({
        name: "Result",
        value: `${Webhook.getStatusText(workflow_job.conclusion)}`,
        inline: true,
      });
    }

    // Add duration if available
    if (workflow_job.started_at && workflow_job.completed_at) {
      const duration = Webhook.formatDuration(
        workflow_job.started_at,
        workflow_job.completed_at
      );

      fields.push({
        name: "Duration",
        value: duration,
        inline: true,
      });
    }

    // Add runner if enabled and available
    if (config.show_runner && workflow_job.runner_name) {
      fields.push({
        name: "Runner",
        value: workflow_job.runner_name,
        inline: true,
      });
    }

    // Add job ID
    fields.push({
      name: "Job ID",
      value: `#${workflow_job.id}`,
      inline: true,
    });

    // Determine embed color based on conclusion
    let embedColor = config.embed_color;
    if (workflow_job.conclusion === "success") {
      embedColor = 0x28a745; // Green
    } else if (workflow_job.conclusion === "failure") {
      embedColor = 0xdc3545; // Red
    } else if (workflow_job.conclusion === "cancelled") {
      embedColor = 0x6c757d; // Gray
    }

    // Send Discord embed
    await Webhook.send({
      title: `Workflow Job ${workflow_job.name} (${repository.full_name})`,
      description: [
        `>>> Workflow job **${workflow_job.name}** ${statusText} in [\`${repository.full_name}\`](https://github.com/${repository.full_name})`,
        "```diff",
        workflow_job.conclusion === "success" ? "+ Job completed successfully" : workflow_job.conclusion === "failure" ? "- Job failed" : `! Job ${workflow_job.conclusion}`,
        workflow_job.started_at && workflow_job.completed_at ? `! Duration: ${Webhook.formatDuration(workflow_job.started_at, workflow_job.completed_at)}` : "",
        "```"
      ].filter(line => line !== "").join("\n"),
      color: embedColor,
      fields: [
        {
          name: `\`${workflow_job.name}\``,
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
