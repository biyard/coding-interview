import { expect, type Page } from "@playwright/test";

export const accounts = {
  company: "company@lighthouse.test",
  investor: "investor@lighthouse.test",
  peer: "peer@lighthouse.test",
} as const;

/** Unique per run so repeated runs (and the desktop/mobile projects) never collide. */
export const runToken = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function login(page: Page, account: keyof typeof accounts) {
  await page.goto("/");
  await page.getByLabel("이메일").fill(accounts[account]);
  await page.getByLabel("비밀번호").fill("dataroom");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
}

export async function openReviewPlugin(page: Page) {
  await page.getByRole("navigation").getByRole("link", { name: "검토" }).click();
}

export async function uploadDocument(page: Page, title: string, fileName: string, content: string) {
  await page.goto("/workspace/lighthouse/documents/new");
  await page.getByLabel("파일").setInputFiles({
    name: fileName,
    mimeType: "text/markdown",
    buffer: Buffer.from(content, "utf8"),
  });
  await page.getByLabel("제목").fill(title);
  await page.getByRole("button", { name: "등록", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}
