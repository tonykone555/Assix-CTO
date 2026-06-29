import { z } from "zod";

export const ActionTypeSchema = z.enum([
  "navigate",
  "click",
  "type",
  "select",
  "hover",
  "dragAndDrop",
  "scroll",
  "scrollIntoView",
  "screenshot",
  "extractText",
  "extractHtml",
  "extractAttribute",
  "waitForSelector",
  "waitForNavigation",
  "waitForTimeout",
  "waitForHuman",
  "evaluate",
  "pressKey",
  "check",
  "uncheck",
  "focus",
  "fileChooser",
  "reload",
  "goBack",
  "goForward",
  "close",
  "humanIntervention",
  "mouseClick",
  "mouseMove",
  "keyboardType",
  "saveLeads",
]);

export const SaveLeadsParamsSchema = z.object({
  leads: z.array(z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    details: z.string().optional(),
    metadata: z.record(z.string(), z.any())
.optional(),
  })),
});

export const HumanInterventionParamsSchema = z.object({
  type: z.enum(["login", "2fa", "generic"]),
  message: z.string(),
});

export const NavigateParamsSchema = z.object({
  url: z.string(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
});

export const ClickParamsSchema = z.object({
  selector: z.string(),
  force: z.boolean().optional(),
  modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  clickCount: z.number().optional(),
  delay: z.number().optional(),
  button: z.enum(["left", "right", "middle"]).optional(),
});

export const TypeParamsSchema = z.object({
  selector: z.string(),
  value: z.string(),
  clearFirst: z.boolean().optional(),
  delay: z.number().optional(),
});

export const SelectParamsSchema = z.object({
  selector: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
});

export const HoverParamsSchema = z.object({
  selector: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).optional(),
  force: z.boolean().optional(),
});

export const DragAndDropParamsSchema = z.object({
  sourceSelector: z.string(),
  targetSelector: z.string(),
  sourcePosition: z.object({ x: z.number(), y: z.number() }).optional(),
  targetPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  force: z.boolean().optional(),
});

export const ScrollParamsSchema = z.object({
  deltaX: z.number().optional(),
  deltaY: z.number().optional(),
  selector: z.string().optional(),
});

export const ScrollIntoViewParamsSchema = z.object({
  selector: z.string(),
  behavior: z.enum(["auto", "smooth", "instant"]).optional(),
  block: z.enum(["start", "center", "end", "nearest"]).optional(),
  inline: z.enum(["start", "center", "end", "nearest"]).optional(),
});

export const ScreenshotParamsSchema = z.object({
  selector: z.string().optional(),
  fullPage: z.boolean().optional(),
  quality: z.enum(["low", "medium", "high", "ultra"]).optional(),
  asBase64: z.boolean().optional(),
});

export const ExtractTextParamsSchema = z.object({
  selector: z.string(),
  trim: z.boolean().optional(),
  join: z.string().optional(),
  first: z.boolean().optional(),
});

export const ExtractHtmlParamsSchema = z.object({
  selector: z.string(),
  outer: z.boolean().optional(),
  first: z.boolean().optional(),
});

export const ExtractAttributeParamsSchema = z.object({
  selector: z.string(),
  attribute: z.string(),
  first: z.boolean().optional(),
});

export const WaitForSelectorParamsSchema = z.object({
  selector: z.string(),
  state: z.enum(["attached", "detached", "visible", "hidden"]).optional(),
  timeout: z.number().optional(),
});

export const WaitForNavigationParamsSchema = z.object({
  url: z.string().optional(), // In LLM context, we'll use string for regex if needed
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
  timeout: z.number().optional(),
});

export const WaitForTimeoutParamsSchema = z.object({
  ms: z.number(),
});

export const EvaluateParamsSchema = z.object({
  expression: z.string(),
  arg: z.any().optional(),
});

export const PressKeyParamsSchema = z.object({
  key: z.string(),
  delay: z.number().optional(),
});

export const CheckParamsSchema = z.object({
  selector: z.string(),
  force: z.boolean().optional(),
});

export const UncheckParamsSchema = z.object({
  selector: z.string(),
  force: z.boolean().optional(),
});

export const FocusParamsSchema = z.object({
  selector: z.string(),
});

export const FileChooserParamsSchema = z.object({
  selector: z.string(),
  files: z.array(z.string()),
});

export const KeyboardTypeParamsSchema = z.object({
  text: z.string(),
  delay: z.number().optional(),
});

export const MouseClickParamsSchema = z.object({
  x: z.number(),
  y: z.number(),
  button: z.enum(["left", "right", "middle"]).optional(),
  clickCount: z.number().optional(),
  delay: z.number().optional(),
});

export const MouseMoveParamsSchema = z.object({
  x: z.number(),
  y: z.number(),
  steps: z.number().optional(),
});

export const ActionSchema = z.object({
  type: ActionTypeSchema,
  params: z.any(), // We'll refine this if needed, but for the LLM output it's easier this way
  description: z.string().optional(),
});

export const WorkflowSchema = z.array(ActionSchema);
