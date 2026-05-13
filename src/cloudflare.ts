const API_BASE = "https://api.cloudflare.com/client/v4";

interface CfEnvelope<T> {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	result: T;
}

export interface CfList {
	id: string;
	name: string;
	kind: "ip" | "redirect" | "hostname" | "asn";
	num_items: number;
	created_on: string;
	modified_on: string;
	description?: string;
}

export interface CfBulkOperationStatus {
	id: string;
	status: "pending" | "running" | "completed" | "failed";
	error?: string;
}

export class CloudflareClient {
	constructor(
		private readonly accountId: string,
		private readonly apiToken: string,
	) {}

	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const headers = new Headers(init.headers);
		headers.set("Authorization", `Bearer ${this.apiToken}`);
		headers.set("Accept", "application/json");
		if (init.body && !headers.has("Content-Type")) {
			headers.set("Content-Type", "application/json");
		}

		const r = await fetch(`${API_BASE}${path}`, { ...init, headers });
		const body = await r.text();
		let parsed: CfEnvelope<T> | undefined;
		try {
			parsed = body ? (JSON.parse(body) as CfEnvelope<T>) : undefined;
		} catch { /* ignore */ }

		if (!r.ok || !parsed?.success) {
			const errs = parsed?.errors?.map((e) => `${e.code} ${e.message}`).join("; ")
				?? `HTTP ${r.status}`;
			throw new Error(`Cloudflare API ${path}: ${errs}`);
		}
		return parsed.result;
	}

	listLists(): Promise<CfList[]> {
		return this.request<CfList[]>(`/accounts/${this.accountId}/rules/lists`);
	}

	async findListByName(name: string): Promise<CfList | undefined> {
		const lists = await this.listLists();
		return lists.find((l) => l.name === name);
	}

	createList(input: { name: string; description?: string; kind?: "ip" }): Promise<CfList> {
		return this.request<CfList>(`/accounts/${this.accountId}/rules/lists`, {
			method: "POST",
			body: JSON.stringify({
				kind: input.kind ?? "ip",
				name: input.name,
				description: input.description,
			}),
		});
	}

	replaceItems(
		listId: string,
		items: Array<{ ip: string; comment?: string }>,
	): Promise<{ operation_id: string }> {
		return this.request<{ operation_id: string }>(
			`/accounts/${this.accountId}/rules/lists/${listId}/items`,
			{ method: "PUT", body: JSON.stringify(items) },
		);
	}

	getOperationStatus(operationId: string): Promise<CfBulkOperationStatus> {
		return this.request<CfBulkOperationStatus>(
			`/accounts/${this.accountId}/rules/lists/bulk_operations/${operationId}`,
		);
	}

	async waitForOperation(operationId: string): Promise<CfBulkOperationStatus> {
		const deadline = Date.now() + 60_000;
		while (true) {
			const s = await this.getOperationStatus(operationId);
			if (s.status === "completed" || s.status === "failed") return s;
			if (Date.now() > deadline) return s;
			await new Promise((r) => setTimeout(r, 2_000));
		}
	}
}
