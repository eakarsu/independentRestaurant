"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  ClipboardList,
  UtensilsCrossed,
  Package,
  Users,
  UserCircle,
  BarChart3,
  Plug,
  Settings,
  Home,
  ChefHat,
  Tag,
  CalendarClock,
  Gift,
  DollarSign,
  Truck,
  Trash2,
  Bell,
  BookOpen,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Reservations", href: "/reservations", icon: CalendarDays },
  { name: "Orders", href: "/orders", icon: ClipboardList },
  { name: "Kitchen Display", href: "/kitchen", icon: ChefHat },
  { name: "Deliveries", href: "/deliveries", icon: Truck },
  { name: "Menu", href: "/menu", icon: UtensilsCrossed },
  { name: "Recipes", href: "/recipes", icon: BookOpen },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Waste Tracking", href: "/waste", icon: Trash2 },
  { name: "Promotions", href: "/promotions", icon: Tag },
  { name: "Staff", href: "/staff", icon: Users },
  { name: "Scheduling", href: "/scheduling", icon: CalendarClock },
  { name: "Performance", href: "/performance", icon: TrendingUp },
  { name: "Tips", href: "/tips", icon: DollarSign },
  { name: "Customers", href: "/customers", icon: UserCircle },
  { name: "Loyalty", href: "/loyalty", icon: Gift },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Locations", href: "/locations", icon: MapPin },
  { name: "Integrations", href: "/integrations", icon: Plug },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <UtensilsCrossed className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">Restaurant Operations</span>
        </Link>
      </div>
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <div className="border-t p-4">
        <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Admin User</p>
            <p className="text-xs text-muted-foreground truncate">admin@restaurant.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
