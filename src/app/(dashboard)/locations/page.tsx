"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Plus, Building, Phone, Mail, Clock, Star, Edit, Trash2 } from "lucide-react";

interface Location {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
  email?: string;
  timezone: string;
  isActive: boolean;
  isPrimary: boolean;
  operatingHours?: Record<string, { open: string; close: string }>;
  createdAt: string;
}

const timezones = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona (No DST)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
];

const defaultHours = {
  monday: { open: "11:00", close: "22:00" },
  tuesday: { open: "11:00", close: "22:00" },
  wednesday: { open: "11:00", close: "22:00" },
  thursday: { open: "11:00", close: "22:00" },
  friday: { open: "11:00", close: "23:00" },
  saturday: { open: "10:00", close: "23:00" },
  sunday: { open: "10:00", close: "21:00" },
};

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    email: "",
    timezone: "America/New_York",
    isActive: true,
    isPrimary: false,
    operatingHours: defaultHours,
  });

  const fetchLocations = async () => {
    try {
      const response = await fetch("/api/locations");
      const data = await response.json();
      setLocations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const handleSubmit = async () => {
    try {
      const url = editingLocation
        ? `/api/locations/${editingLocation.id}`
        : "/api/locations";
      const method = editingLocation ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowCreateDialog(false);
        setEditingLocation(null);
        resetForm();
        fetchLocations();
      }
    } catch (error) {
      console.error("Error saving location:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this location?")) return;

    try {
      const response = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      if (response.ok) {
        fetchLocations();
        setSelectedLocation(null);
      }
    } catch (error) {
      console.error("Error deleting location:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      phone: "",
      email: "",
      timezone: "America/New_York",
      isActive: true,
      isPrimary: false,
      operatingHours: defaultHours,
    });
  };

  const openEditDialog = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      code: location.code,
      address: location.address,
      city: location.city,
      state: location.state,
      zipCode: location.zipCode,
      phone: location.phone || "",
      email: location.email || "",
      timezone: location.timezone,
      isActive: location.isActive,
      isPrimary: location.isPrimary,
      operatingHours: (location.operatingHours as typeof defaultHours) || defaultHours,
    });
    setShowCreateDialog(true);
  };

  const updateOperatingHours = (day: string, field: "open" | "close", value: string) => {
    setFormData({
      ...formData,
      operatingHours: {
        ...formData.operatingHours,
        [day]: {
          ...formData.operatingHours[day as keyof typeof formData.operatingHours],
          [field]: value,
        },
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <MapPin className="h-8 w-8 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Locations</h1>
          <p className="text-muted-foreground">Manage your restaurant locations</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setEditingLocation(null);
            setShowCreateDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{locations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <MapPin className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {locations.filter((l) => l.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <MapPin className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">
              {locations.filter((l) => !l.isActive).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Location Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {locations.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No locations yet</h3>
              <p className="text-muted-foreground">Add your first restaurant location</p>
              <Button
                className="mt-4"
                onClick={() => {
                  resetForm();
                  setShowCreateDialog(true);
                }}
              >
                Add Location
              </Button>
            </CardContent>
          </Card>
        ) : (
          locations.map((location) => (
            <Card
              key={location.id}
              className={`cursor-pointer hover:shadow-lg transition-shadow ${
                !location.isActive ? "opacity-60" : ""
              }`}
              onClick={() => setSelectedLocation(location)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>{location.name}</CardTitle>
                      {location.isPrimary && (
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      )}
                    </div>
                    <CardDescription>{location.code}</CardDescription>
                  </div>
                  <Badge variant={location.isActive ? "default" : "secondary"}>
                    {location.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <span>
                    {location.address}, {location.city}, {location.state} {location.zipCode}
                  </span>
                </div>
                {location.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{location.phone}</span>
                  </div>
                )}
                {location.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{location.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {timezones.find((tz) => tz.value === location.timezone)?.label ||
                      location.timezone}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>
            <DialogDescription>
              {editingLocation
                ? "Update location details"
                : "Add a new restaurant location"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location Name</Label>
                <Input
                  placeholder="Downtown"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  placeholder="DT"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Street Address</Label>
              <Input
                placeholder="123 Main Street"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  placeholder="New York"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  placeholder="NY"
                  value={formData.state}
                  onChange={(e) =>
                    setFormData({ ...formData, state: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>ZIP Code</Label>
                <Input
                  placeholder="10001"
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="downtown@restaurant.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData({ ...formData, timezone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Operating Hours */}
            <div className="space-y-2">
              <Label>Operating Hours</Label>
              <div className="grid gap-2">
                {Object.entries(formData.operatingHours).map(([day, hours]) => (
                  <div key={day} className="flex items-center gap-4">
                    <span className="w-24 capitalize text-sm">{day}</span>
                    <Input
                      type="time"
                      value={hours.open}
                      onChange={(e) => updateOperatingHours(day, "open", e.target.value)}
                      className="w-32"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={hours.close}
                      onChange={(e) => updateOperatingHours(day, "close", e.target.value)}
                      className="w-32"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked })
                  }
                />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isPrimary}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isPrimary: checked })
                  }
                />
                <Label>Primary Location</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setEditingLocation(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !formData.name ||
                  !formData.code ||
                  !formData.address ||
                  !formData.city ||
                  !formData.state ||
                  !formData.zipCode
                }
              >
                {editingLocation ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Location Detail Dialog */}
      <Dialog open={!!selectedLocation} onOpenChange={() => setSelectedLocation(null)}>
        <DialogContent className="max-w-lg">
          {selectedLocation && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>{selectedLocation.name}</DialogTitle>
                  {selectedLocation.isPrimary && (
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  )}
                </div>
                <DialogDescription>
                  Location Code: {selectedLocation.code}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p>{selectedLocation.address}</p>
                    <p>
                      {selectedLocation.city}, {selectedLocation.state}{" "}
                      {selectedLocation.zipCode}
                    </p>
                  </div>
                </div>

                {selectedLocation.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <a
                      href={`tel:${selectedLocation.phone}`}
                      className="hover:underline"
                    >
                      {selectedLocation.phone}
                    </a>
                  </div>
                )}

                {selectedLocation.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <a
                      href={`mailto:${selectedLocation.email}`}
                      className="hover:underline"
                    >
                      {selectedLocation.email}
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span>
                    {timezones.find((tz) => tz.value === selectedLocation.timezone)
                      ?.label || selectedLocation.timezone}
                  </span>
                </div>

                {selectedLocation.operatingHours && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Operating Hours</h4>
                    <div className="grid gap-1 text-sm">
                      {Object.entries(selectedLocation.operatingHours).map(
                        ([day, hours]) => (
                          <div key={day} className="flex justify-between">
                            <span className="capitalize">{day}</span>
                            <span>
                              {hours.open} - {hours.close}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t">
                  <Badge variant={selectedLocation.isActive ? "default" : "secondary"}>
                    {selectedLocation.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openEditDialog(selectedLocation);
                        setSelectedLocation(null);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(selectedLocation.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
