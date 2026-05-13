const SOURCE_URL = "https://raw.githubusercontent.com/PBH-BTN/BTN-Collected-Rules/main/combine/all.txt";

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;
const IPV6 = /^[0-9a-f:]+(\/\d{1,3})?$/;

interface FetchResult {
	ips: string[];
	invalidCount: number;
}

export async function fetchBtnList(): Promise<FetchResult> {
	const r = await fetch(SOURCE_URL, {
		cf: { cacheTtl: 0, cacheEverything: false },
		headers: {
			"User-Agent": "btn-ip-list-worker (+https://github.com/PBH-BTN/BTN-Collected-Rules)",
		},
	});
	if (!r.ok) {
		throw new Error(`Failed to fetch BTN source: ${r.status} ${r.statusText}`);
	}
	return parseBtnList(await r.text());
}

function parseBtnList(text: string): FetchResult {
	const seen = new Set<string>();
	let invalidCount = 0;

	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.length === 0 || line.startsWith("#")) continue;

		const v = line.toLowerCase();
		if (IPV4.test(v) || (IPV6.test(v) && v.includes(":"))) {
			seen.add(v);
		} else {
			invalidCount++;
		}
	}

	return { ips: [...seen].sort(), invalidCount };
}
