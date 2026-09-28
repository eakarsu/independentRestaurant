export const metadata = {
  title: "Restaurant Assistant",
  description: "Ask about the menu, allergens, hours or a table request.",
};

export default function AssistantPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Restaurant Assistant</h1>
      <p className="text-muted-foreground">
        Ask about the menu, allergens, opening hours or a table request. The chat opens in the
        bottom-right corner; a team member confirms every dietary and booking request.
      </p>
    </main>
  );
}
