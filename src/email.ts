import type { IpDiff } from "./diff.js";

interface SummaryEmailInput {
	to: string;
	from: { email: string; name: string };
	listName: string;
	totalIps: number;
	diff: IpDiff;
	timestamp: Date;
	error?: string;
}

const MAX_LISTED = 500;

export async function sendSummaryEmail(
	binding: SendEmail,
	input: SummaryEmailInput,
): Promise<void> {
	const added = input.diff.added.length;
	const removed = input.diff.removed.length;
	const changed = added + removed;
	const failPrefix = input.error ? "[FAILED] " : "";

	const subject = changed === 0
		? `${failPrefix}[BTN IP List] no changes — ${input.totalIps} entries`
		: `${failPrefix}[BTN IP List] +${added} / -${removed} — ${input.totalIps} entries`;

	const lines: string[] = [
		`BTN IP List sync summary`,
		``,
		`Timestamp:  ${input.timestamp.toISOString()}`,
		`List name:  ${input.listName}`,
		`Total:      ${input.totalIps}`,
		`Added:      ${added}`,
		`Removed:    ${removed}`,
		`Unchanged:  ${input.diff.unchanged}`,
	];

	if (input.error) {
		lines.push(``, `Error: ${input.error}`);
	}

	if (added > 0) {
		lines.push(``, `-- Added (${added}) --`);
		lines.push(...input.diff.added.slice(0, MAX_LISTED));
		if (added > MAX_LISTED) lines.push(`... and ${added - MAX_LISTED} more`);
	}

	if (removed > 0) {
		lines.push(``, `-- Removed (${removed}) --`);
		lines.push(...input.diff.removed.slice(0, MAX_LISTED));
		if (removed > MAX_LISTED) lines.push(`... and ${removed - MAX_LISTED} more`);
	}

	await binding.send({
		to: input.to,
		from: { email: input.from.email, name: input.from.name },
		subject,
		text: lines.join("\n"),
	});
}
