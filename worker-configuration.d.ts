interface Env {
	CF_LIST_NAME: string;
	EMAIL_TO: string;
	EMAIL_FROM: string;
	EMAIL_FROM_NAME: string;
	CF_ACCOUNT_ID: string;

	LIST_API_TOKEN: string;
	ADMIN_TOKEN?: string;

	EMAIL: SendEmail;
	BTN_STATE: KVNamespace;
}
