/// <reference lib="webworker" />

import { createWorkerMessageHandler } from "@/workers/embedding/messages"

globalThis.addEventListener("message", createWorkerMessageHandler())
