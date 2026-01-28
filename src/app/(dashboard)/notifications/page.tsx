"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Mail, MessageSquare, Send, Plus, RefreshCw } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  channel: string;
  recipient: string;
  subject?: string;
  message: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

interface NotificationTemplate {
  id: string;
  name: string;
  type: string;
  channel: string;
  subject?: string;
  content: string;
  isActive: boolean;
}

const notificationTypes = [
  { value: "ORDER_CONFIRMATION", label: "Order Confirmation" },
  { value: "ORDER_READY", label: "Order Ready" },
  { value: "RESERVATION_CONFIRMATION", label: "Reservation Confirmation" },
  { value: "RESERVATION_REMINDER", label: "Reservation Reminder" },
  { value: "WAITLIST_READY", label: "Waitlist Ready" },
  { value: "DELIVERY_UPDATE", label: "Delivery Update" },
  { value: "LOYALTY_UPDATE", label: "Loyalty Update" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "FEEDBACK_REQUEST", label: "Feedback Request" },
  { value: "CUSTOM", label: "Custom" },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [sending, setSending] = useState(false);

  const [newNotification, setNewNotification] = useState({
    type: "CUSTOM",
    channel: "EMAIL",
    recipient: "",
    subject: "",
    message: "",
  });

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    type: "CUSTOM",
    channel: "EMAIL",
    subject: "",
    content: "",
  });

  const fetchData = async () => {
    try {
      const [notifRes, templatesRes] = await Promise.all([
        fetch("/api/notifications"),
        fetch("/api/notifications/templates"),
      ]);
      const [notifData, templatesData] = await Promise.all([
        notifRes.json(),
        templatesRes.json(),
      ]);
      setNotifications(notifData);
      setTemplates(Array.isArray(templatesData) ? templatesData : []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSendNotification = async () => {
    setSending(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNotification),
      });
      if (response.ok) {
        setShowSendDialog(false);
        setNewNotification({
          type: "CUSTOM",
          channel: "EMAIL",
          recipient: "",
          subject: "",
          message: "",
        });
        fetchData();
      }
    } catch (error) {
      console.error("Error sending notification:", error);
    } finally {
      setSending(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      const response = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTemplate),
      });
      if (response.ok) {
        setShowTemplateDialog(false);
        setNewTemplate({
          name: "",
          type: "CUSTOM",
          channel: "EMAIL",
          subject: "",
          content: "",
        });
        fetchData();
      }
    } catch (error) {
      console.error("Error creating template:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return <Badge className="bg-green-500">Delivered</Badge>;
      case "SENT":
        return <Badge className="bg-blue-500">Sent</Badge>;
      case "PENDING":
        return <Badge variant="secondary">Pending</Badge>;
      case "FAILED":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getChannelIcon = (channel: string) => {
    return channel === "SMS" ? (
      <MessageSquare className="h-4 w-4" />
    ) : (
      <Mail className="h-4 w-4" />
    );
  };

  const stats = {
    total: notifications.length,
    delivered: notifications.filter((n) => n.status === "DELIVERED").length,
    pending: notifications.filter((n) => n.status === "PENDING").length,
    failed: notifications.filter((n) => n.status === "FAILED").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">Manage SMS and email notifications</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowSendDialog(true)}>
            <Send className="h-4 w-4 mr-2" />
            Send Notification
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <Mail className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.delivered}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <MessageSquare className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <Bell className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Notification History</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Notifications</CardTitle>
              <CardDescription>View all sent notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No notifications yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    notifications.map((notification) => (
                      <TableRow
                        key={notification.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedNotification(notification)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getChannelIcon(notification.channel)}
                            {notification.channel}
                          </div>
                        </TableCell>
                        <TableCell>
                          {notificationTypes.find((t) => t.value === notification.type)?.label ||
                            notification.type}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {notification.recipient}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {notification.message}
                        </TableCell>
                        <TableCell>{getStatusBadge(notification.status)}</TableCell>
                        <TableCell>
                          {notification.sentAt
                            ? new Date(notification.sentAt).toLocaleString()
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowTemplateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No templates created yet</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowTemplateDialog(true)}
                  >
                    Create your first template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      {getChannelIcon(template.channel)}
                    </div>
                    <CardDescription>
                      {notificationTypes.find((t) => t.value === template.type)?.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {template.subject && (
                      <p className="text-sm font-medium mb-2">Subject: {template.subject}</p>
                    )}
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {template.content}
                    </p>
                    <Badge variant={template.isActive ? "default" : "secondary"} className="mt-4">
                      {template.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Send Notification Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Notification</DialogTitle>
            <DialogDescription>Send an SMS or email notification</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={newNotification.channel}
                  onValueChange={(value) =>
                    setNewNotification({ ...newNotification, channel: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={newNotification.type}
                  onValueChange={(value) =>
                    setNewNotification({ ...newNotification, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {notificationTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Recipient</Label>
              <Input
                placeholder={
                  newNotification.channel === "EMAIL"
                    ? "customer@email.com"
                    : "+1 (555) 123-4567"
                }
                value={newNotification.recipient}
                onChange={(e) =>
                  setNewNotification({ ...newNotification, recipient: e.target.value })
                }
              />
            </div>
            {newNotification.channel === "EMAIL" && (
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  placeholder="Email subject"
                  value={newNotification.subject}
                  onChange={(e) =>
                    setNewNotification({ ...newNotification, subject: e.target.value })
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Enter your message..."
                rows={4}
                value={newNotification.message}
                onChange={(e) =>
                  setNewNotification({ ...newNotification, message: e.target.value })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSendDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendNotification}
                disabled={!newNotification.recipient || !newNotification.message || sending}
              >
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>Create a reusable notification template</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                placeholder="e.g., Order Confirmation"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={newTemplate.channel}
                  onValueChange={(value) => setNewTemplate({ ...newTemplate, channel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={newTemplate.type}
                  onValueChange={(value) => setNewTemplate({ ...newTemplate, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {notificationTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newTemplate.channel === "EMAIL" && (
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  placeholder="Email subject with {{variables}}"
                  value={newTemplate.subject}
                  onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                placeholder="Template content with {{variables}}"
                rows={4}
                value={newTemplate.content}
                onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{customerName}}"}, {"{{orderNumber}}"}, etc. for dynamic content
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={!newTemplate.name || !newTemplate.content}
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notification Detail Dialog */}
      <Dialog open={!!selectedNotification} onOpenChange={() => setSelectedNotification(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notification Details</DialogTitle>
          </DialogHeader>
          {selectedNotification && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Channel</Label>
                  <p className="flex items-center gap-2">
                    {getChannelIcon(selectedNotification.channel)}
                    {selectedNotification.channel}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p>
                    {notificationTypes.find((t) => t.value === selectedNotification.type)?.label}
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Recipient</Label>
                <p className="font-mono">{selectedNotification.recipient}</p>
              </div>
              {selectedNotification.subject && (
                <div>
                  <Label className="text-muted-foreground">Subject</Label>
                  <p>{selectedNotification.subject}</p>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground">Message</Label>
                <p className="whitespace-pre-wrap">{selectedNotification.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedNotification.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Sent At</Label>
                  <p>
                    {selectedNotification.sentAt
                      ? new Date(selectedNotification.sentAt).toLocaleString()
                      : "Not sent yet"}
                  </p>
                </div>
              </div>
              {selectedNotification.deliveredAt && (
                <div>
                  <Label className="text-muted-foreground">Delivered At</Label>
                  <p>{new Date(selectedNotification.deliveredAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
