import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/providers/session-provider";
import AssistantWidget from "@/components/AssistantWidget";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Restaurant Operations",
  description: "Auditable restaurant order, kitchen, inventory, and fulfillment operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster />
          <AssistantWidget name="Restaurant Assistant" greeting="Hi! Ask me about the menu, hours or a table." position="bottom-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
