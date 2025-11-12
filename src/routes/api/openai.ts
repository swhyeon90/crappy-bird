import { createFileRoute } from "@tanstack/react-router"; // or "@tanstack/start" depending on your setup

export const Route = createFileRoute("/api/openai")({
  server: {
    // Handlers correspond to HTTP verbs
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json();

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
          }),
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
