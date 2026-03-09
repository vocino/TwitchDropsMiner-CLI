import { z } from "zod";

export const PriorityModeSchema = z.enum(["priority_only", "ending_soonest", "low_avbl_first"]);

export const ConfigSchema = z.object({
  proxy: z.string().default(""),
  language: z.string().default("English"),
  darkMode: z.boolean().default(false),
  exclude: z.array(z.string()).default([]),
  priority: z.array(z.string()).default([]),
  autostartTray: z.boolean().default(false),
  connectionQuality: z.number().int().min(1).max(6).default(1),
  trayNotifications: z.boolean().default(true),
  enableBadgesEmotes: z.boolean().default(false),
  availableDropsCheck: z.boolean().default(false),
  priorityMode: PriorityModeSchema.default("priority_only")
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

