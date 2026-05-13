export interface IpDiff {
	added: string[];
	removed: string[];
	unchanged: number;
}

export function diffIps(previous: string[], current: string[]): IpDiff {
	const prev = new Set(previous);
	const curr = new Set(current);

	const added: string[] = [];
	for (const ip of curr) if (!prev.has(ip)) added.push(ip);

	const removed: string[] = [];
	for (const ip of prev) if (!curr.has(ip)) removed.push(ip);

	let unchanged = 0;
	for (const ip of curr) if (prev.has(ip)) unchanged++;

	added.sort();
	removed.sort();
	return { added, removed, unchanged };
}
