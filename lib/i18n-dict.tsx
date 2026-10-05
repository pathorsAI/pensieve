import type { ReactNode } from "react";

// Copy for the auth screens only (/, /access, /accept, /login, /consent). Kept
// free of server imports so client components can read it too: functions can't
// cross the server → client boundary as props, so clients get `locale` and look
// their strings up here.

export type Locale = "zh-TW" | "en";
export const LOCALES: readonly Locale[] = ["zh-TW", "en"];
export const LOCALE_COOKIE = "pnsv_locale";

/** `<html lang>` value: the UI is Traditional Chinese, not just "zh". */
export const htmlLang = (l: Locale) => (l === "en" ? "en" : "zh-Hant");

const Q = ({ children }: Readonly<{ children: ReactNode }>) => <span className="whitespace-nowrap">「{children}」</span>;
const QEn = ({ children }: Readonly<{ children: ReactNode }>) => <span className="whitespace-nowrap">“{children}”</span>;

const zh = {
  art: {
    tagline: "在文件之間飛行。",
    sub: "同步資料夾與 repo，團隊知道的每一件事都在一張活的關聯圖上。",
  },
  common: {
    signInFailed: "登入失敗，請重新整理後再試一次。",
    noMethods: "這個環境還沒有設定任何登入方式。",
    currentAccount: "目前登入的帳號",
    switchAccount: "換一個帳號登入",
    signOut: "登出",
  },
  methods: {
    google: "使用 Google 登入",
  },
  doc: {
    openInWorkspace: "在 workspace 中開啟",
    openInWorkspaceHint: "帶著側欄與關聯圖瀏覽這份文件",
    workspaceHomeHint: "回到 workspace 首頁",
  },
  home: {
    metaTitle: "登入 · Pensieve",
    ctx: "登入",
    title: "登入 Pensieve",
  },
  access: {
    metaTitle: "登入 · Pensieve",
    ctxSignIn: "登入",
    ctxDenied: "沒有權限",
    signInTitle: "登入以繼續",
    signInLead: (slug: string | null): ReactNode =>
      slug ? <><Q>{slug}</Q>只有成員看得到。登入後會回到你剛剛要開的頁面。</> : "這個頁面只有成員看得到。登入後會回到你剛剛要開的頁面。",
    signInFine: "只有受邀的帳號能進入 workspace。沒有帳號的話，請 workspace 的管理員邀請你的 email。",
    deniedTitle: "這個帳號不是成員",
    workspacesLabel: "你可以進入的 workspace",
    deniedFine: (email: string) => <>需要權限的話，請 workspace 的管理員邀請 <b>{email}</b>。</>,
  },
  accept: {
    metaTitle: "接受邀請 · Pensieve",
    ctx: "邀請",
    title: (org: string) => `加入 ${org}`,
    invitedBy: (inviter: string, email: string) => <><b>{inviter}</b> 邀請 <b>{email}</b> 加入這個 workspace。</>,
    signInFine: (email: string) => <>請用 <b>{email}</b> 登入，登入後就能接受邀請。</>,
    accept: "接受邀請",
    acceptFailed: "沒有成功接受邀請，請重新整理後再試一次。",
    mismatch: (invited: string, current: string) =>
      <>這個邀請是寄給 <b>{invited}</b>，你目前登入的是 <b>{current}</b>。請換成受邀的帳號登入。</>,
    invalidTitle: "這個邀請已經失效",
    invalidLead: (inviter: string | null): ReactNode =>
      inviter
        ? <>邀請可能已經過期、被取消或已經用過。請 <b>{inviter}</b> 重新寄一次邀請給你。</>
        : "邀請可能已經過期、被取消或已經用過。請邀請你的人重新寄一次邀請。",
  },
  login: {
    metaTitle: "登入 · Pensieve",
    ctx: "授權應用程式",
    title: "登入後授權給應用程式",
    lead: "有應用程式要求讀取你的 Pensieve 文件。先登入，接著再決定要不要授權給它。",
  },
  consent: {
    metaTitle: "授權存取 · Pensieve",
    ctx: "授權應用程式",
    needLoginTitle: "需要先登入",
    needLoginLead: "這個授權請求還沒有登入的帳號，請重新登入後再繼續。",
    continueToLogin: "前往登入",
    title: "授權存取",
    unnamedClient: "未具名的應用程式",
    lead: (client: ReactNode, email: string) => <><b>{client}</b> 想要以 {email} 的身分讀取你的 workspace 文件。</>,
    scopesHeading: "要求的權限",
    scopes: {
      openid: "確認你的身分",
      profile: "讀取你的名稱與頭像",
      email: "讀取你的電子郵件地址",
      offline_access: "在你沒開著瀏覽器時繼續存取（可自動更新授權）",
    } as Record<string, string>,
    noScopes: "基本身分（未要求額外權限）",
    docsScope: "搜尋、閱讀你所屬 workspace 的文件與連結關係",
    workspacesHeading: "涵蓋的 workspace",
    noWorkspaces: "你目前沒有任何 workspace。",
    workspacesNote: "之後加入的 workspace 也會一併涵蓋。這個授權只能讀取，不能修改或刪除任何文件。",
    allow: "允許存取",
    deny: "拒絕",
    failed: "授權沒有完成，請回到用戶端重新連線一次。",
  },
};

export type Dict = typeof zh;

const en: Dict = {
  art: {
    tagline: "Fly between your documents.",
    sub: "Sync folders and repos; everything your team knows lives on one living graph.",
  },
  common: {
    signInFailed: "Sign-in failed. Reload the page and try again.",
    noMethods: "No sign-in method is configured for this environment.",
    currentAccount: "Current account",
    switchAccount: "Sign in with another account",
    signOut: "Sign out",
  },
  methods: {
    google: "Sign in with Google",
  },
  doc: {
    openInWorkspace: "Open in workspace",
    openInWorkspaceHint: "Browse this document with the sidebar and graph",
    workspaceHomeHint: "Back to the workspace home",
  },
  home: {
    metaTitle: "Sign in · Pensieve",
    ctx: "Sign in",
    title: "Sign in to Pensieve",
  },
  access: {
    metaTitle: "Sign in · Pensieve",
    ctxSignIn: "Sign in",
    ctxDenied: "No access",
    signInTitle: "Sign in to continue",
    signInLead: (slug: string | null): ReactNode =>
      slug
        ? <>Only members can see <QEn>{slug}</QEn>. After signing in you’ll land back on the page you were opening.</>
        : "Only members can see this page. After signing in you’ll land back on the page you were opening.",
    signInFine: "Only invited accounts can enter a workspace. If you don’t have access, ask a workspace admin to invite your email.",
    deniedTitle: "This account isn’t a member",
    workspacesLabel: "Workspaces you can open",
    deniedFine: (email: string) => <>To get access, ask a workspace admin to invite <b>{email}</b>.</>,
  },
  accept: {
    metaTitle: "Accept invitation · Pensieve",
    ctx: "Invitation",
    title: (org: string) => `Join ${org}`,
    invitedBy: (inviter: string, email: string) => <><b>{inviter}</b> invited <b>{email}</b> to this workspace.</>,
    signInFine: (email: string) => <>Sign in as <b>{email}</b>, then accept the invitation.</>,
    accept: "Accept invitation",
    acceptFailed: "Couldn’t accept the invitation. Reload the page and try again.",
    mismatch: (invited: string, current: string) =>
      <>This invitation was sent to <b>{invited}</b>, but you’re signed in as <b>{current}</b>. Sign in with the invited account.</>,
    invalidTitle: "This invitation is no longer valid",
    invalidLead: (inviter: string | null): ReactNode =>
      inviter
        ? <>It may have expired, been cancelled, or already been used. Ask <b>{inviter}</b> to send you a new one.</>
        : "It may have expired, been cancelled, or already been used. Ask the person who invited you to send a new one.",
  },
  login: {
    metaTitle: "Sign in · Pensieve",
    ctx: "Authorize an app",
    title: "Sign in to authorize an app",
    lead: "An app is asking to read your Pensieve documents. Sign in first, then decide whether to authorize it.",
  },
  consent: {
    metaTitle: "Authorize access · Pensieve",
    ctx: "Authorize an app",
    needLoginTitle: "Sign in first",
    needLoginLead: "This authorization request has no signed-in account. Sign in again to continue.",
    continueToLogin: "Go to sign-in",
    title: "Authorize access",
    unnamedClient: "An unnamed app",
    lead: (client: ReactNode, email: string) => <><b>{client}</b> wants to read your workspace documents as {email}.</>,
    scopesHeading: "Requested permissions",
    scopes: {
      openid: "Confirm who you are",
      profile: "Read your name and profile picture",
      email: "Read your email address",
      offline_access: "Keep access while your browser is closed (authorization renews automatically)",
    },
    noScopes: "Basic identity (no extra permissions requested)",
    docsScope: "Search and read documents and their links in the workspaces you belong to",
    workspacesHeading: "Workspaces covered",
    noWorkspaces: "You don’t have any workspaces yet.",
    workspacesNote: "Workspaces you join later are covered too. This grant is read-only: it cannot change or delete any document.",
    allow: "Allow access",
    deny: "Deny",
    failed: "Authorization didn’t complete. Go back to the app and connect again.",
  },
};

const DICTS: Record<Locale, Dict> = { "zh-TW": zh, en };

export const dictFor = (l: Locale): Dict => DICTS[l];
