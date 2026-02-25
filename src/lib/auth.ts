/**
 * NextAuth 配置
 * - Google OAuth：需设置 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * - Credentials（邮箱 + 密码）：支持 Gmail / QQ邮箱 / 163邮箱等所有邮箱
 */
import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db, initDb } from "./db";

type DbUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  password_hash: string | null;
  google_id: string | null;
};

function rowToUser(row: Record<string, unknown>): DbUser {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string | null,
    image: row.image as string | null,
    password_hash: row.password_hash as string | null,
    google_id: row.google_id as string | null,
  };
}

export const authOptions: AuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    CredentialsProvider({
      id: "credentials",
      name: "邮箱",
      credentials: {
        email:    { label: "邮箱",  type: "email"  },
        password: { label: "密码",  type: "password" },
        name:     { label: "用户名", type: "text"  },
        action:   { label: "action", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        await initDb();
        const r = await db.execute({
          sql: "SELECT * FROM users WHERE email = ?",
          args: [credentials.email],
        });
        const existing = r.rows[0] ? rowToUser(r.rows[0] as Record<string, unknown>) : undefined;

        if (credentials.action === "register") {
          if (existing) throw new Error("EMAIL_TAKEN");
          const hash = await bcrypt.hash(credentials.password, 12);
          const id = randomUUID();
          const displayName = credentials.name?.trim() || credentials.email.split("@")[0];
          await db.execute({
            sql: "INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)",
            args: [id, credentials.email, displayName, hash],
          });
          return { id, email: credentials.email, name: displayName };
        }

        if (!existing?.password_hash) return null;
        const valid = await bcrypt.compare(credentials.password, existing.password_hash);
        if (!valid) return null;
        return { id: existing.id, email: existing.email, name: existing.name };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && user.email) {
        await initDb();
        const r = await db.execute({
          sql: "SELECT id FROM users WHERE email = ?",
          args: [user.email],
        });
        const row = r.rows[0] as Record<string, unknown> | undefined;

        if (!row) {
          const id = randomUUID();
          await db.execute({
            sql: "INSERT INTO users (id, email, name, image, google_id) VALUES (?, ?, ?, ?, ?)",
            args: [id, user.email ?? null, user.name ?? null, user.image ?? null, (profile as { sub?: string })?.sub ?? null],
          });
          user.id = id;
        } else {
          await db.execute({
            sql: "UPDATE users SET google_id = ?, image = ? WHERE email = ?",
            args: [(profile as { sub?: string })?.sub ?? null, user.image ?? null, user.email ?? null],
          });
          user.id = row.id as string;
        }
      }
      return true;
    },

    async jwt({ token, user, account }) {
      if (user?.id) {
        token.userId = user.id;
      } else if (account?.provider === "google" && token.email) {
        await initDb();
        const r = await db.execute({
          sql: "SELECT id FROM users WHERE email = ?",
          args: [token.email],
        });
        const row = r.rows[0] as Record<string, unknown> | undefined;
        if (row) token.userId = row.id as string;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) session.user.id = token.userId as string;
      return session;
    },
  },

  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};
