"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Upload,
  Eye,
  ArrowLeft,
  Clock
} from "lucide-react";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  parseISO,
  isValid,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  isSameDay
} from "date-fns";

import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import AuthCheck from "@/components/AuthCheck";
import { useAuth } from "@/lib/hooks/useAuth";

import { CalendarEvent } from "@/lib/googleCalendar"; // Adjust path if needed
import { NotionDatabase } from "@/lib/db/notionDatabaseService"; // Adjust path if needed
import { SchedulingRules } from "@/app/services/schedulingService"; // Adjust path if needed

import { cn, getBaseUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getOrCreateUserId } from "@/lib/localStorage/storageUtils";

/**
 * We show times from 3 AM through 11 PM (21 slots).
 * You can increase or decrease these if you want more coverage.
 */
const TIME_SLOTS = Array.from({ length: 21 }, (_, i) => i + 3);

/**
 * This page merges:
 * - Styling and basic CRUD from the first snippet
 * - Notion scheduling from the second snippet
 * - 15-min increments
 * - Drag resizing of events
 */
export default function SchedulePage() {
  const { user } = useAuth();

  /*************************************************
   * Authentication & Basic State
   *************************************************/
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);

  // For unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [showSavePrompt, setShowSavePrompt] = useState<boolean>(false);
  const [pendingNavigation, setPendingNavigation] = useState<Date | null>(null);

  // For user's local time zone
  const [userTimeZone, setUserTimeZone] = useState<string>("UTC");

  // For events from Google Calendar
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [deletedEvents, setDeletedEvents] = useState<string[]>([]);

  // For creating new event
  const [isCreatingEvent, setIsCreatingEvent] = useState<boolean>(false);
  const [newEvent, setNewEvent] = useState({
    summary: "",
    description: "",
    startDateTime: "",
    endDateTime: "",
    // We keep 'duration' for the form, but we handle actual times in 15-min increments
    duration: 60,
  });

  // For editing an existing event
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showEditEventModal, setShowEditEventModal] = useState<boolean>(false);

  // For calendar navigation
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));

  // For tracking whether user is actively dragging an event
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  // "topOffset" is the Y position in the cell when user started dragging
  const [dragStartOffset, setDragStartOffset] = useState<number | null>(null);
  // Whether we are dragging the top or bottom edge of the event (to move vs. resize)
  const [draggingEdge, setDraggingEdge] = useState<"move" | "resize-top" | "resize-bottom" | null>(null);

  /*************************************************
   * Notion Scheduling Data
   *************************************************/
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("");
  const [daysAhead, setDaysAhead] = useState<number>(7);
  const [schedulingRules, setSchedulingRules] = useState<SchedulingRules | null>(null);
  const [scheduleSource, setScheduleSource] = useState<"ideal-week" | "this-week">("ideal-week");

  const [draftEvents, setDraftEvents] = useState<CalendarEvent[]>([]);
  const [showDraftCalendar, setShowDraftCalendar] = useState<boolean>(false);
  const [scheduling, setScheduling] = useState(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [schedulingSuccess, setSchedulingSuccess] = useState<string | null>(null);

  /*************************************************
   * Beforeunload Event to Warn on Unsaved Changes
   *************************************************/
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
    e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  /*************************************************
   * Time Zone Detection
   *************************************************/
  useEffect(() => {
    try {
      // Check if timezone is stored in cookie
      const storedTimezone = document.cookie
        .split("; ")
        .find((row) => row.startsWith("user_timezone="))
        ?.split("=")[1];

      if (storedTimezone) {
        setUserTimeZone(storedTimezone);
      } else {
        // Detect timezone from browser
        const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setUserTimeZone(detectedTimeZone);

        // Store in cookie for future visits (expires in 30 days)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        document.cookie = `user_timezone=${detectedTimeZone}; expires=${expiryDate.toUTCString()}; path=/`;
      }
    } catch (err) {
      console.error("Error detecting timezone:", err);
      // Fallback to UTC if detection fails
      setUserTimeZone("UTC");
    }
  }, []);

  /*************************************************
   * Check Auth & Fetch Calendar Events
   *************************************************/
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      setError(null);
      setShowAuthPrompt(false);

      try {
        // Check if we have an access token in cookies
        const baseUrl = getBaseUrl();
        const response = await fetch(`${baseUrl}/api/auth/check`, {
          method: "GET",
          credentials: "include",
        });

        if (response.ok) {
          const authData = await response.json();
          if (authData.authenticated) {
            setIsAuthenticated(true);
            await fetchEvents();
          } else {
            setIsAuthenticated(false);
            setShowAuthPrompt(true);
          }
        } else {
          setIsAuthenticated(false);
          setShowAuthPrompt(true);
        }
      } catch (err) {
        console.error("Error checking authentication:", err);
        setIsAuthenticated(false);
        setShowAuthPrompt(true);
        setError("Failed to check authentication");
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, [weekStart]);

  const fetchEvents = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const start = weekStart;
      const end = endOfWeek(weekStart);
      const baseUrl = getBaseUrl();

      const response = await fetch(
        `${baseUrl}/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          setShowAuthPrompt(true);
          setIsAuthenticated(false);
          throw new Error("Your Google Calendar authentication has expired");
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed with status: ${response.status}`);
      }

      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error("Error fetching events:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch events");
      // If it's an auth error, show the prompt
      if (
        err instanceof Error &&
        (err.message.includes("auth") ||
          err.message.includes("token") ||
          err.message.includes("permission") ||
          err.message.includes("unauthorized"))
      ) {
        setShowAuthPrompt(true);
        setIsAuthenticated(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  /*************************************************
   * Calendar Navigation
   *************************************************/
  const goToPreviousWeek = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(subWeeks(weekStart, 1));
      setShowSavePrompt(true);
    } else {
      setWeekStart(subWeeks(weekStart, 1));
    }
  };

  const goToNextWeek = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(addWeeks(weekStart, 1));
      setShowSavePrompt(true);
    } else {
      setWeekStart(addWeeks(weekStart, 1));
    }
  };

  const goToToday = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(startOfWeek(new Date()));
      setShowSavePrompt(true);
    } else {
      setWeekStart(startOfWeek(new Date()));
      setSelectedDate(new Date());
    }
  };

  const completeNavigation = () => {
    if (pendingNavigation) {
      setWeekStart(pendingNavigation);
      setPendingNavigation(null);
    }
    setShowSavePrompt(false);
  };

  /*************************************************
   * Create, Update, Delete
   *************************************************/
  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { summary, description, startDateTime, endDateTime } = newEvent;

      const tempEvent: CalendarEvent = {
        id: `temp-${Date.now()}`,
        summary,
        description,
        start: {
          dateTime: startDateTime,
          timeZone: userTimeZone,
        },
        end: {
          dateTime: endDateTime,
          timeZone: userTimeZone,
        },
        isNew: true,
        isTemp: true,
      };

      setEvents((prev) => [...prev, tempEvent]);
      setHasUnsavedChanges(true);

      // Clear the create form
      setNewEvent({
        summary: "",
        description: "",
        startDateTime: "",
        endDateTime: "",
        duration: 60,
      });
      setIsCreatingEvent(false);
    } catch (err) {
      console.error("Error creating event:", err);
      setError("Failed to create event");
    }
  };

  const updateEvent = (updatedEvent: CalendarEvent) => {
    setEvents((prev) =>
      prev.map((event) =>
        event.id === updatedEvent.id
          ? { ...updatedEvent, isUpdated: true }
          : event
      )
    );
    setHasUnsavedChanges(true);
  };

  const deleteEvent = (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (!eventId.startsWith("temp-")) {
      // Mark real events for deletion
      setDeletedEvents((prev) => [...prev, eventId]);
    }
    setHasUnsavedChanges(true);
  };

  const saveChanges = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Gather new, updated, and deleted events
      const createdEvents = events.filter((e) => e.isTemp);
      const updatedEvents = events.filter((e) => e.isUpdated && !e.isTemp);
      // Already tracked in state
      const removedEventIds = [...deletedEvents];
      const baseUrl = getBaseUrl();

      // 1. Process new events
      for (const event of createdEvents) {
        const response = await fetch(`${baseUrl}/api/calendar/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: event.summary,
            description: event.description,
            startDateTime: event.start.dateTime,
            endDateTime: event.end.dateTime,
            timeZone: userTimeZone,
          }),
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `Failed to create event: ${errorData.error || response.statusText}`
          );
        }

        // Replace the temp event with the newly created real event
        const result = await response.json();
        setEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...result.event } : e))
        );
      }

      // 2. Process updated events
      for (const event of updatedEvents) {
        const response = await fetch(`${baseUrl}/api/calendar/events`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: event.id,
            updates: {
              summary: event.summary,
              description: event.description,
              start: {
                dateTime: event.start.dateTime,
                timeZone: userTimeZone,
              },
              end: {
                dateTime: event.end.dateTime,
                timeZone: userTimeZone,
              },
            },
          }),
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `Failed to update event: ${errorData.error || response.statusText}`
          );
        }
      }

      // 3. Process deletions
      for (const id of removedEventIds) {
        const response = await fetch(`${baseUrl}/api/calendar/events?eventId=${id}`, {
          method: "DELETE",
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `Failed to delete event: ${errorData.error || response.statusText}`
          );
        }
      }

      // Clear deletion queue
      setDeletedEvents([]);
      // Refresh events
      await fetchEvents();

      setHasUnsavedChanges(false);
      setSuccessMessage("Changes saved successfully to Google Calendar!");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(`Failed to save changes to Google Calendar: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  /*************************************************
   * Utility
   *************************************************/
  const formatEventTime = (dateTimeString: string) => {
    const date = parseISO(dateTimeString);
    return isValid(date) ? format(date, "h:mm a") : "Invalid date";
  };

  const formatDateTimeForInput = (dateTimeString: string) => {
    try {
      const date = parseISO(dateTimeString);
      if (!isValid(date)) return "";
      return format(date, "yyyy-MM-dd'T'HH:mm");
    } catch {
      return "";
    }
  };

  // Days of the current week
  const getDaysOfWeek = () => {
    const start = weekStart;
    const end = endOfWeek(start);
    return eachDayOfInterval({ start, end });
  };

  // For day/hours grid
  const getEventsForTimeSlot = (day: Date, hour: number) =>
    events.filter((event) => {
      if (!event.start.dateTime || !event.end.dateTime) return false;
      const startDate = parseISO(event.start.dateTime);
      const endDate = parseISO(event.end.dateTime);
      if (!isValid(startDate) || !isValid(endDate)) return false;
      if (!isSameDay(startDate, day)) return false;

      const startHour = startDate.getHours();
      const endHour = endDate.getHours();
      // If the event passes through this hour
      return (
        (startHour < hour && endHour > hour) ||
        (startHour === hour && endHour > hour) ||
        (startHour < hour && endHour === hour && endDate.getMinutes() > 0) ||
        (startHour === hour && endHour === hour)
      );
    });
    
  // For draft events in day/hours grid
  const getDraftEventsForTimeSlot = (day: Date, hour: number) => {
    console.log(`▶️ FILTERING DRAFT EVENTS FOR ${format(day, 'yyyy-MM-dd')} @ ${hour}:00`);
    
    return draftEvents.filter((event) => {
      try {
        if (!event.start?.dateTime || !event.end?.dateTime) {
          console.error("▶️ DRAFT EVENT MISSING DATETIME:", event);
          return false;
        }
        
        const startDate = parseISO(event.start.dateTime);
        const endDate = parseISO(event.end.dateTime);
        
        if (!isValid(startDate) || !isValid(endDate)) {
          console.error("▶️ DRAFT EVENT HAS INVALID DATE:", {
            start: event.start.dateTime,
            end: event.end.dateTime,
            startValid: isValid(startDate),
            endValid: isValid(endDate)
          });
          return false;
        }
        
        if (!isSameDay(startDate, day)) {
          return false;
        }
        
        const startHour = startDate.getHours();
        const endHour = endDate.getHours();
        
        // If the event passes through this hour
        const isInTimeSlot = (
          (startHour < hour && endHour > hour) || // Spans across this hour
          (startHour === hour) || // Starts in this hour
          (endHour === hour && endDate.getMinutes() > 0) // Ends in this hour (and not at XX:00)
        );
        
        if (isInTimeSlot) {
          console.log(`▶️ DRAFT EVENT MATCHES TIME SLOT: ${event.summary} at ${startDate.toISOString()}`);
        }
        
        return isInTimeSlot;
      } catch (error) {
        console.error("▶️ ERROR FILTERING DRAFT EVENT:", error, event);
        return false;
      }
    });
  };

  // Calculate how to position the event box within the cell
  const calculateEventPosition = (event: CalendarEvent, hour: number) => {
    console.log("▶️ CALCULATING POSITION FOR:", event.summary, "at hour:", hour);
    
    try {
      // Must have start and end datetimes
      if (!event.start?.dateTime || !event.end?.dateTime) {
        console.error("▶️ MISSING DATETIME IN EVENT:", event);
        return { top: 0, height: 25 }; // Default fallback
      }
      
      const start = parseISO(event.start.dateTime);
      const end = parseISO(event.end.dateTime);
      
      if (!isValid(start) || !isValid(end)) {
        console.error("▶️ INVALID DATE IN EVENT:", {
          event,
          startValid: isValid(start),
          endValid: isValid(end),
          startRaw: event.start.dateTime,
          endRaw: event.end.dateTime
        });
        return { top: 0, height: 25 }; // Default fallback
      }
      
      // Debugging info
      console.log(`▶️ EVENT TIMES: Start: ${start.toISOString()}, End: ${end.toISOString()}`);
      console.log(`▶️ EVENT START HOUR: ${start.getHours()}, MINUTES: ${start.getMinutes()}`);
      console.log(`▶️ EVENT END HOUR: ${end.getHours()}, MINUTES: ${end.getMinutes()}`);
      
      // Calculate position based on start time
      let topPercent = 0;
      if (start.getHours() === hour) {
        // Calculate percentage of the hour (e.g., 30 minutes = 50%)
        topPercent = (start.getMinutes() / 60) * 100;
      }
      
      // Calculate height based on duration
      let heightPercent;
      
      // If start and end are in same hour
      if (start.getHours() === hour && end.getHours() === hour) {
        heightPercent = ((end.getMinutes() - start.getMinutes()) / 60) * 100;
      }
      // If starts in this hour but ends in future hour
      else if (start.getHours() === hour) {
        heightPercent = ((60 - start.getMinutes()) / 60) * 100;
      }
      // If ends in this hour but started in past hour
      else if (end.getHours() === hour) {
        heightPercent = (end.getMinutes() / 60) * 100;
      }
      // If event spans this entire hour
      else {
        heightPercent = 100;
      }
      
      // Ensure minimum height for visibility
      if (heightPercent < 10) heightPercent = 10;
      
      console.log(`▶️ POSITION CALCULATED: top=${topPercent}%, height=${heightPercent}%`);
      
      return {
        top: topPercent,
        height: heightPercent,
      };
    } catch (error) {
      console.error("▶️ ERROR CALCULATING POSITION:", error, event);
      return { top: 0, height: 25 }; // Default fallback if error
    }
  };

  const getEventColor = (event: CalendarEvent) => {
    // Hash for consistent color
    const hash = (str: string) => {
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = (h << 5) - h + str.charCodeAt(i);
        h &= h;
      }
      return Math.abs(h);
    };
  const colorOptions = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-yellow-500",
      "bg-red-500",
      "bg-indigo-500",
      "bg-orange-500",
      "bg-teal-500",
    ];
    const colorIndex = hash(event.summary || event.id) % colorOptions.length;
    return colorOptions[colorIndex];
  };

  // Timezone display
  const formatTimezone = (timezone: string) => {
    try {
      const date = new Date();
      const timeString = date.toLocaleTimeString("en-US", {
        timeZone: timezone,
        timeZoneName: "short",
      });
      const tzAbbr = timeString.split(" ").pop();
      return tzAbbr || timezone;
    } catch {
      return timezone;
    }
  };

  /*************************************************
   * 15-Min Increments: Clicking the empty cell
   *************************************************/
  const handleTimeSlotClick = (
    day: Date,
    hour: number,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    // E.g. if user clicks halfway down the cell, that's ~30 minutes
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const fraction = offsetY / rect.height; // 0.0 to 1.0
    // Round to nearest 15-min block
    const minutes = Math.floor(fraction * 4) * 15;

    const startDateTime = new Date(day);
    startDateTime.setHours(hour, minutes, 0, 0);

    // By default, create a 30-min or 60-min event; we'll do 60
    const endDateTime = new Date(startDateTime);
    endDateTime.setMinutes(startDateTime.getMinutes() + 60);

    setNewEvent({
      summary: "",
      description: "",
      startDateTime: format(startDateTime, "yyyy-MM-dd'T'HH:mm"),
      endDateTime: format(endDateTime, "yyyy-MM-dd'T'HH:mm"),
      duration: 60,
    });
    setIsCreatingEvent(true);
  };

  /*************************************************
   * Handle drag (move/resize) on existing events
   *************************************************/
  const handleEventMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    event: CalendarEvent,
    edge: "move" | "resize-top" | "resize-bottom"
  ) => {
    e.stopPropagation();
    setDraggingEventId(event.id);
    setDraggingEdge(edge);

    // The Y position within that div
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    setDragStartOffset(offsetY);

    // If we want to open edit modal on click without drag, we can do a short delay
    // or handle it in onMouseUp vs onClick. For simplicity, we skip direct "edit on click"
    // since we already do that if user clicks on the text portion. 
  };

  /**
   * On mouse move, recalc event's new start/end
   */
  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingEventId || !draggingEdge) return;

    // We need to figure out which day/hour cell we are in, and the fraction within that hour cell
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!target) return;

    // If the user is dragging over something that's not our time cell, bail
    const dayCell = target.closest("[data-day-cell]");
    if (!dayCell) return;

    // Extract day=YYYY-MM-dd, hour=0-23 from data attributes
    const dayString = dayCell.getAttribute("data-day");
    const hourString = dayCell.getAttribute("data-hour");
    if (!dayString || !hourString) return;

    const hour = parseInt(hourString);
    const dayDate = parseISO(dayString);
    if (!isValid(dayDate)) return;

    // Now figure out fraction within that cell
    const rect = dayCell.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let fraction = offsetY / rect.height;
    // Clamp fraction between 0 and 1
    fraction = Math.max(0, Math.min(1, fraction));

    // Round fraction to nearest 15-min
    const minuteBlock = Math.floor(fraction * 4) * 15;
    const newDateTime = new Date(dayDate);
    newDateTime.setHours(hour, minuteBlock, 0, 0);

    // We find the event and update its start/end accordingly
    setEvents((prev) => {
      return prev.map((ev) => {
        if (ev.id !== draggingEventId) return ev;

        const startDate = parseISO(ev.start.dateTime);
        const endDate = parseISO(ev.end.dateTime);
        if (!isValid(startDate) || !isValid(endDate)) return ev;

        const duration = endDate.getTime() - startDate.getTime();

        if (draggingEdge === "move") {
          // Keep the same duration, just shift so that the mouse is at the same offset
          const offsetWithinEvent = dragStartOffset ?? 0;
          // offsetWithinEvent is between 0 and the height of the event block
          // Let's approximate that fraction of the block
          // We'll keep it simple: we move the event so that the top is the new time
          // ignoring the offset for brevity. 
          // If you want to factor in the exact offset of the click, you can compute a fraction
          // and shift accordingly.
          const newStart = new Date(newDateTime);
          // or "newStart.setMinutes(newStart.getMinutes() - offsetInMinutes)"
          const newEnd = new Date(newStart.getTime() + duration);
          return {
            ...ev,
            start: {
              dateTime: format(newStart, "yyyy-MM-dd'T'HH:mm"),
              timeZone: userTimeZone,
            },
            end: {
              dateTime: format(newEnd, "yyyy-MM-dd'T'HH:mm"),
              timeZone: userTimeZone,
            },
            isUpdated: true,
          };
        } else if (draggingEdge === "resize-top") {
          // The new top is newDateTime, keep the bottom the same
          // But ensure we don't invert start/end
          const newStart = newDateTime < endDate ? newDateTime : endDate;
          return {
            ...ev,
            start: {
              dateTime: format(newStart, "yyyy-MM-dd'T'HH:mm"),
              timeZone: userTimeZone,
            },
            isUpdated: true,
          };
        } else if (draggingEdge === "resize-bottom") {
          // Keep the top the same, set new bottom
          const newEnd = newDateTime > startDate ? newDateTime : startDate;
          return {
            ...ev,
            end: {
              dateTime: format(newEnd, "yyyy-MM-dd'T'HH:mm"),
              timeZone: userTimeZone,
            },
            isUpdated: true,
          };
        }
        return ev;
      });
    });
    setHasUnsavedChanges(true);
  };

  /**
   * End the drag
   */
  const handleMouseUp = () => {
    if (!draggingEventId) return;
    setDraggingEventId(null);
    setDragStartOffset(null);
    setDraggingEdge(null);
  };

  // Attach global listeners for drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => handleMouseMove(e);
    const onUp = () => handleMouseUp();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingEventId, draggingEdge]);

  /*************************************************
   * Input Handlers (Create/Edit)
   *************************************************/
  const handleNewEventChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "duration") {
      const durationMinutes = parseInt(value);
      const startDate = newEvent.startDateTime
        ? parseISO(newEvent.startDateTime)
        : null;

      if (startDate && isValid(startDate)) {
        const endDate = new Date(startDate);
        endDate.setMinutes(startDate.getMinutes() + durationMinutes);
        setNewEvent((prev) => ({
          ...prev,
          duration: durationMinutes,
          endDateTime: format(endDate, "yyyy-MM-dd'T'HH:mm"),
        }));
      } else {
        setNewEvent((prev) => ({ ...prev, duration: durationMinutes }));
      }
      return;
    }

    if (name === "startDateTime") {
      const startDate = parseISO(value);
      if (isValid(startDate)) {
        const endDate = new Date(startDate);
        endDate.setMinutes(startDate.getMinutes() + newEvent.duration);
        setNewEvent((prev) => ({
          ...prev,
          startDateTime: value,
          endDateTime: format(endDate, "yyyy-MM-dd'T'HH:mm"),
        }));
      } else {
        setNewEvent((prev) => ({ ...prev, startDateTime: value }));
      }
      return;
    }

    setNewEvent((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditEventChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!editingEvent) return;
    const { name, value } = e.target;

    if (name === "startDateTime") {
      setEditingEvent({
        ...editingEvent,
        start: { ...editingEvent.start, dateTime: value },
      });
    } else if (name === "endDateTime") {
      setEditingEvent({
        ...editingEvent,
        end: { ...editingEvent.end, dateTime: value },
      });
    } else {
      setEditingEvent({ ...editingEvent, [name]: value });
    }
  };

  /*************************************************
   * Notion Scheduling
   *************************************************/
  useEffect(() => {
    async function fetchDatabases() {
      try {
        const userIdLocal = user?.uid || getOrCreateUserId();
        console.log("🔄 DATABASES: Fetching databases for user:", userIdLocal);
        
        const baseUrl = getBaseUrl();
        const response = await fetch(`${baseUrl}/api/notion-databases?userId=${encodeURIComponent(userIdLocal)}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch Notion databases: ${response.status}`);
        }
        
        const dbData = await response.json();
        console.log("🔄 DATABASES: Received databases:", dbData);
        
        // Filter for active databases only
        const activeDatabases = dbData.filter((db: NotionDatabase) => db.isActive);
        console.log("🔄 DATABASES: Active databases:", activeDatabases);
        
        setDatabases(activeDatabases);
        
        // If we have active databases but no selection, select the first one
        if (activeDatabases.length > 0 && !selectedDatabaseId) {
          setSelectedDatabaseId(activeDatabases[0].id);
        }
      } catch (err) {
        console.error("🔄 DATABASES: Error fetching databases:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch databases");
      }
    }

    if (user) {
      fetchDatabases();
    }
  }, [user]); // Only run when user changes

  const fetchSchedulingRules = async () => {
    try {
      // Use getOrCreateUserId to avoid null user issues
      const userId = user?.uid || getOrCreateUserId();
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/api/scheduling-rules?userId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch scheduling rules");
      const data = await response.json();
      setSchedulingRules(data);
    } catch (err) {
      console.error("Error fetching scheduling rules:", err);
    }
  };

  const handleScheduleAndUpload = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setScheduling(true);

    if (!scheduleSource) {
      setError("Please select either Ideal Week or This Week as your schedule source.");
      setIsLoading(false);
      setScheduling(false);
      return;
    }

    if (!isAuthenticated) {
      setError("Google Calendar authentication required");
      setShowAuthPrompt(true);
      setIsLoading(false);
      setScheduling(false);
      return;
    }

    try {
      // Make sure we have scheduling rules
      if (!schedulingRules) {
        await fetchSchedulingRules();
      }
      
      // Get the user ID
      const userId = user?.uid || getOrCreateUserId();
      const baseUrl = getBaseUrl();

      // Step 1: Generate the scheduled events
      const response = await fetch(`${baseUrl}/api/schedule-tasks/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          scheduleSource, // Use the selected schedule source
          startDate: weekStart.toISOString(),
          daysAhead,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || `Error: HTTP ${response.status}`;
        } catch (e) {
          errorMessage = `Error: HTTP ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!result.events || result.events.length === 0) {
        throw new Error("No events were scheduled. This may be due to scheduling constraints or lack of available time slots.");
      }

      // Step 2: Upload the events directly without showing preview
      const uploadResponse = await fetch(`${baseUrl}/api/schedule-tasks/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          events: result.events,
        }),
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || "Failed to upload events");
      }

      const uploadResult = await uploadResponse.json();
      setSuccessMessage(
        `Successfully scheduled and uploaded ${uploadResult.totalUploaded} events to your calendar!`
      );

      // Refresh the calendar events
      fetchEvents();
    } catch (err) {
      console.error("Error scheduling and uploading events:", err);
      setError(err instanceof Error ? err.message : "Failed to schedule and upload events");
    } finally {
      setIsLoading(false);
      setScheduling(false);
    }
  };

  // Add this useEffect to fetch scheduling rules when component mounts
  useEffect(() => {
    if (user) {
      fetchSchedulingRules();
    }
  }, [user]);

  // Add a test function to fetch tasks directly using the API
  const testFetchTasks = async (userId: string, databaseId: string) => {
    try {
      console.log("🧪 TEST: Fetching tasks directly from API for database:", databaseId);
      
      // Use the same approach as the notion-sync page
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/api/tasks?userId=${encodeURIComponent(userId)}`);
      if (!response.ok) {
        console.error("🧪 TEST: Failed to fetch tasks:", response.status);
        return;
      }
      
      const tasks = await response.json();
      console.log(`🧪 TEST: Found ${tasks.length} total tasks`);
      
      // Filter for the selected database
      const tasksForDatabase = tasks.filter((task: any) => 
        task.notionDatabaseId === databaseId || 
        task.database_id === databaseId ||
        task.source === databaseId
      );
      
      console.log(`🧪 TEST: After filtering, found ${tasksForDatabase.length} tasks for database ${databaseId}`);
      console.log("🧪 TEST: Tasks for database:", tasksForDatabase);
      
      return tasksForDatabase;
    } catch (error) {
      console.error("🧪 TEST: Error fetching tasks:", error);
    }
  };

  const handleScheduleTasks = async () => {
    setScheduling(true);
    setError(null);
    setSchedulingSuccess(null);
    
    // Clear existing draft events
    setDraftEvents([]);
    setShowDraftCalendar(false);

    if (!scheduleSource) {
      setError("Please select either Ideal Week or This Week as your schedule source.");
      setScheduling(false);
      return;
    }
    
    if (!isAuthenticated) {
      setError("Google Calendar authentication required");
      setShowAuthPrompt(true);
      setScheduling(false);
      return;
    }

    try {
      // Set the startDate to the beginning of the current week
      const startDate = weekStart;
      const baseUrl = getBaseUrl();
      
      console.log("▶️ SCHEDULING: Scheduling tasks with params:", {
        userId: user?.uid || getOrCreateUserId(),
        scheduleSource,
        startDate: startDate.toISOString(),
        daysAhead
      });
      
      // Show feedback to user
      setError("Requesting schedule preview... Please wait");
      
      const response = await fetch(`${baseUrl}/api/schedule-tasks/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.uid || getOrCreateUserId(),
          scheduleSource,
          startDate: startDate.toISOString(),
          daysAhead,
        }),
      });
      
      console.log("▶️ SCHEDULING: Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("▶️ SCHEDULING: Error response:", errorText);
        
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || `Error: HTTP ${response.status}`;
        } catch (e) {
          errorMessage = `Error: HTTP ${response.status}`;
        }
        
        setError(errorMessage);
        setShowDraftCalendar(false);
        setScheduling(false);
        return;
      }
      
      const result = await response.json();
      console.log("▶️ SCHEDULING: Schedule result:", result);
      
      if (!result.events || result.events.length === 0) {
        console.log("▶️ SCHEDULING: No events were generated");
        setError("No events were scheduled. This may be due to scheduling constraints or lack of available time slots.");
        setShowDraftCalendar(false);
        setScheduling(false);
        return;
      }
      
      // Success! We have events
      console.log(`▶️ SCHEDULING: Generated ${result.events.length} events`);
      setDraftEvents(result.events);
      setError(null);
      setShowDraftCalendar(true);
      setSchedulingSuccess(`Successfully scheduled ${result.events.length} events!`);
      
    } catch (err) {
      console.error("▶️ SCHEDULING: Error scheduling tasks:", err);
      setError(err instanceof Error ? err.message : "Failed to schedule tasks");
      setShowDraftCalendar(false);
    } finally {
      setScheduling(false);
    }
  };

  /*************************************************
   * UI
   *************************************************/
  if (!user) {
  return (
      <div className="container mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle>Task Scheduling</CardTitle>
            <CardDescription>Please sign in to schedule tasks</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
      <AuthCheck>
      <div className="flex min-h-screen">
          <Sidebar />
        <div className="ml-64 flex-1 p-6 bg-[#191919] overflow-y-auto">
          {/* Top header / unsaved changes / success messages */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Schedule</h1>
            {hasUnsavedChanges && (
              <div className="flex items-center">
                <span className="text-yellow-400 mr-2">You have unsaved changes</span>
                <Button
                  onClick={saveChanges}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> Save to Google Calendar
                    </>
                  )}
                </Button>
                </div>
            )}
          </div>
          {successMessage && (
            <div className="mb-4 p-3 bg-green-600/20 border border-green-600 rounded text-green-400">
              {successMessage}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-600/20 border border-red-600 rounded text-red-400">
              {error}
            </div>
          )}

          {/* Notion Scheduling Panel */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Select Schedule Source</CardTitle>
              <CardDescription>
                Choose a schedule source to schedule tasks from
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Select
                    value={scheduleSource}
                    onValueChange={(value) => {
                      console.log("🔄 DATABASES: Selected schedule source:", value);
                      setScheduleSource(value as "ideal-week" | "this-week");
                    }}
                  >
                    <SelectTrigger className="w-[300px]">
                      <SelectValue placeholder="Select a schedule source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ideal-week">Ideal Week</SelectItem>
                      <SelectItem value="this-week">This Week</SelectItem>
                    </SelectContent>
                  </Select>
                    </div>

                {/* Add these buttons below the schedule source selection */}
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleScheduleTasks}
                    disabled={scheduling || !scheduleSource}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Schedule
                  </Button>
                  </div>

                <div className="mt-2 text-xs text-white/70">
                  {schedulingSuccess && (
                    <div className="p-2 rounded bg-green-800/50 mb-2">
                      {schedulingSuccess}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auth prompt if needed */}
          {showAuthPrompt && (
            <div className="mb-6 p-4 border border-yellow-600 bg-yellow-500/10 text-yellow-300 rounded">
              <AlertCircle className="inline-block mr-2 h-5 w-5" />
              Google Calendar Authentication Required.{" "}
              <Link
                href="/api/auth/google"
                className="underline font-semibold ml-2"
              >
                Connect Google Calendar
              </Link>
                    </div>
          )}

          {/* Draft Calendar (Notion-scheduled tasks) */}
          {showDraftCalendar && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Draft Calendar Preview</h2>
              </div>
              
              {/* Display status messages */}
              {schedulingSuccess && (
                <div className="mb-2 p-3 bg-green-600/20 border border-green-600 text-green-400 rounded">
                  {schedulingSuccess}
                </div>
              )}
              
              {/* Show draft events count and loading state */}
              <div className="mb-2 p-3 bg-blue-600/20 border border-blue-600 text-blue-400 rounded">
                {scheduling ? (
                              <div className="flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Generating schedule preview...</span>
                  </div>
                ) : (
                                <div>
                    {draftEvents.length > 0 
                      ? `Found ${draftEvents.length} events to schedule` 
                      : "No draft events available. Click 'Schedule' to generate some."}
                                  </div>
                )}
                                </div>
              
              {/* Only show calendar if we have events */}
              {draftEvents.length > 0 ? (
                <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                  {/* Calendar header */}
                  <div className="grid grid-cols-8 border-b border-white/10 text-center">
                    <div className="p-2">
                      <div className="text-xs text-white/50">Timezone</div>
                      <div className="text-sm font-medium text-white">
                        {formatTimezone(userTimeZone)}
                              </div>
                    </div>
                    {getDaysOfWeek().map((day, i) => (
                      <div
                        key={i}
                        className={`p-2 ${
                          isSameDay(day, new Date())
                            ? "bg-purple-500/10 text-white"
                            : "text-white/80"
                        }`}
                      >
                        <div className="text-xs">{format(day, "EEE")}</div>
                        <div className="text-sm font-medium">
                          {format(day, "d MMM")}
                                  </div>
                                </div>
                    ))}
                              </div>
                  
                  {/* Time slots */}
                  <div className="grid grid-cols-8 min-h-[600px]">
                    {/* Time labels */}
                    <div className="border-r border-white/10">
                      {TIME_SLOTS.map((hour) => (
                        <div
                          key={hour}
                          className="h-20 p-2 text-xs text-white/50 flex items-start justify-end"
                        >
                          {hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
                              </div>
                      ))}
                            </div>
                    
                    {/* Days columns */}
                    {getDaysOfWeek().map((day, dayIndex) => (
                      <div key={dayIndex} className="border-r border-white/10">
                        {TIME_SLOTS.map((hour) => {
                          const dayStr = format(day, "yyyy-MM-dd");
                          console.log(`▶️ RENDERING CELL: ${dayStr} at hour ${hour}`);
                          
                          // Get draft events for this time slot
                          const eventsInSlot = getDraftEventsForTimeSlot(day, hour);
                          console.log(`▶️ DRAFT EVENTS IN SLOT (${dayStr} ${hour}): ${eventsInSlot.length}`);
                          
                          return (
                            <div
                              key={`${dayStr}-${hour}`}
                              className="relative h-20 border-b border-white/5 group"
                              data-day={dayStr}
                              data-hour={hour}
                              data-day-cell={true}
                            >
                              {/* Event bubbles */}
                              {eventsInSlot.map((ev) => {
                                try {
                                  if (!ev.start?.dateTime || !ev.end?.dateTime) {
                                    console.error("▶️ EVENT MISSING DATETIME:", ev);
                                    return null;
                                  }
                                  
                                  // Calculate position within this hour slot
                                  const { top, height } = calculateEventPosition(ev, hour);
                                  console.log(`▶️ POSITIONED EVENT: ${ev.summary} at top ${top}%, height ${height}%`);
                                  
                                  return (
                                    <div
                                      key={ev.id}
                                      className="absolute left-0 right-0 ml-[2px] mr-[2px] rounded-sm overflow-hidden p-1 cursor-pointer z-10"
                                      style={{
                                        top: `${top}%`,
                                        height: `${height}%`,
                                        backgroundColor: "rgba(168, 85, 247, 0.4)", // Light purple
                                        borderLeft: "4px solid rgb(168, 85, 247)",
                                      }}
                                    >
                                      <div className="text-xs text-white font-medium truncate">
                                        {ev.summary}
                                      </div>
                                      <div className="text-xs text-white/70 truncate">
                                        {parseISO(ev.start.dateTime).getMinutes() === 0
                                          ? format(parseISO(ev.start.dateTime), "h a")
                                          : format(parseISO(ev.start.dateTime), "h:mm a")}
                                      </div>
                                    </div>
                                  );
                                } catch (error) {
                                  console.error("▶️ ERROR RENDERING EVENT:", error, ev);
                                  return null;
                                }
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-white/5 rounded-lg border border-white/10">
                  <div className="text-xl font-semibold text-white mb-2">No Events To Display</div>
                  <p className="text-white/70">
                    Select a schedule source and click "Schedule" to generate events.
                  </p>
                </div>
                      )}
                    </div>
          )}

          {/* Main Google Calendar */}
          <div>
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <Button
                  onClick={goToToday}
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Today
                </Button>
                <div className="flex items-center">
                  <Button
                    onClick={goToPreviousWeek}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10 p-2 h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={goToNextWeek}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10 p-2 h-8 w-8 ml-1"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <h2 className="text-lg font-medium text-white">
                  {format(weekStart, "MMM")} –{" "}
                  {format(endOfWeek(weekStart), "MMM yyyy")}
                </h2>
                    </div>

              <Button
                onClick={() => setIsCreatingEvent(true)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Plus className="mr-2 h-4 w-4" /> Create
              </Button>
            </div>

            {isLoading ? (
              <div className="text-center py-10 text-white">
                <p>Loading events...</p>
              </div>
            ) : error ? (
              <div className="text-center py-10 text-red-400">
                <p>{error}</p>
              </div>
            ) : (
              <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                {/* Day Headers */}
                <div className="grid grid-cols-8 border-b border-white/10">
                  <div className="p-2 text-center text-white/50 text-xs border-r border-white/10">
                    {formatTimezone(userTimeZone)}
                  </div>
                  {getDaysOfWeek().map((day, index) => (
                    <div
                      key={index}
                      className={`p-2 text-center ${
                        isSameDay(day, new Date())
                          ? "bg-blue-600 text-white"
                          : "text-white"
                      }`}
                    >
                      <div className="text-sm">{format(day, "EEE")}</div>
                      <div className="text-xl font-bold">
                        {format(day, "d")}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Time Grid */}
                <div className="relative">
                  {TIME_SLOTS.map((hour) => (
                    <div
                      key={hour}
                      className="grid grid-cols-8 border-b border-white/10"
                    >
                      {/* Time Label */}
                      <div className="p-2 text-right text-white/50 text-xs border-r border-white/10">
                        {hour % 12 === 0 ? 12 : hour % 12}{" "}
                        {hour >= 12 ? "PM" : "AM"}
                      </div>

                      {/* Day Columns */}
                      {getDaysOfWeek().map((day, dayIndex) => {
                        const dayStr = format(day, "yyyy-MM-dd");
                        const eventsInSlot = getEventsForTimeSlot(day, hour);

                        return (
                          <div
                            key={dayIndex}
                            data-day-cell
                            data-day={dayStr}
                            data-hour={hour}
                            className="relative h-16 border-r border-white/10 hover:bg-white/5 cursor-pointer"
                            onClick={(e) => handleTimeSlotClick(day, hour, e)}
                          >
                            {eventsInSlot.map((event, eventIndex) => {
                              const { top, height } = calculateEventPosition(
                                event,
                                hour
                              );
                              const style = {
                                top: `${top}%`,
                                height: `${height}%`,
                                minHeight: "10px",
                                zIndex: 10 + eventIndex,
                              };

                              // We'll add small grips for resizing top/bottom
                              return (
                                <div
                                  key={event.id}
                                  className={`absolute inset-x-0 mx-1 rounded p-1 text-white text-xs ${getEventColor(
                                    event
                                  )} cursor-move border border-white/20`}
                                  style={style}
                                >
                                  {/* Resize handle (top) */}
                                  <div
                                    className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize"
                                    onMouseDown={(e) =>
                                      handleEventMouseDown(
                                        e,
                                        event,
                                        "resize-top"
                                      )
                                    }
                                  ></div>
                                  {/* Main content (move) */}
                                  <div
                                    className="relative w-full h-full cursor-move flex flex-col justify-center"
                                    onMouseDown={(e) =>
                                      handleEventMouseDown(e, event, "move")
                                    }
                                    onDoubleClick={() => {
                                      setEditingEvent(event);
                                      setShowEditEventModal(true);
                                    }}
                                  >
                                    <div className="font-medium truncate">
                                      {event.summary}
                                    </div>
                                    <div className="truncate text-xs">
                                      {formatEventTime(event.start.dateTime)} -{" "}
                                      {formatEventTime(event.end.dateTime)}
                                    </div>
                                  </div>
                                  {/* Resize handle (bottom) */}
                                  <div
                                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
                                    onMouseDown={(e) =>
                                      handleEventMouseDown(
                                        e,
                                        event,
                                        "resize-bottom"
                                      )
                                    }
                                  ></div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Create Event Modal */}
          {isCreatingEvent && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-[#252525] rounded-lg shadow-lg p-6 w-full max-w-md border border-white/10">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  Create New Event
                </h2>
                <form onSubmit={createEvent} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      Title
                    </label>
                          <input
                            type="text"
                      name="summary"
                      value={newEvent.summary}
                      onChange={handleNewEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                            required
                          />
                        </div>
                          <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={newEvent.description}
                      onChange={handleNewEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                      rows={3}
                            />
                          </div>
                          <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      Start
                    </label>
                            <input
                      type="datetime-local"
                      name="startDateTime"
                      value={newEvent.startDateTime}
                      onChange={handleNewEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                      step="900" // 15-min increments
                              required
                            />
                          </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      Duration
                    </label>
                          <select
                      name="duration"
                      value={newEvent.duration}
                      onChange={handleNewEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                    >
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="90">1.5 hours</option>
                      <option value="120">2 hours</option>
                      <option value="180">3 hours</option>
                      <option value="240">4 hours</option>
                          </select>
                        </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      End
                    </label>
                    <input
                      type="datetime-local"
                      name="endDateTime"
                      value={newEvent.endDateTime}
                      onChange={handleNewEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                      step="900"
                      required
                    />
                  </div>
                  <div className="flex justify-end space-x-2 pt-2">
                    <Button
                            type="button"
                      variant="outline"
                      onClick={() => setIsCreatingEvent(false)}
                      className="border-white/20 text-white hover:bg-white/10"
                          >
                            Cancel
                    </Button>
                    <Button
                            type="submit"
                      className="bg-purple-600 hover:bg-purple-700"
                          >
                      Create Event
                    </Button>
                        </div>
                      </form>
              </div>
            </div>
          )}

          {/* Edit Event Modal */}
          {showEditEventModal && editingEvent && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-[#252525] rounded-lg shadow-lg w-full max-w-md border border-white/10">
                <div className="p-4 border-b border-white/10">
                  <h3 className="text-lg font-medium text-white">Edit Event</h3>
                  </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      Event Title
                    </label>
                    <input
                      type="text"
                      name="summary"
                      value={editingEvent.summary}
                      onChange={handleEditEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                      required
                    />
                </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={editingEvent.description || ""}
                      onChange={handleEditEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white h-24"
                    />
              </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      Start Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      name="startDateTime"
                      value={formatDateTimeForInput(editingEvent.start.dateTime)}
                      onChange={handleEditEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                      step="900"
                      required
                    />
            </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white">
                      End Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      name="endDateTime"
                      value={formatDateTimeForInput(editingEvent.end.dateTime)}
                      onChange={handleEditEventChange}
                      className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                      step="900"
                      required
                    />
                  </div>
                </div>
                <div className="p-4 border-t border-white/10 flex justify-between">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (
                        confirm("Are you sure you want to delete this event?")
                      ) {
                        deleteEvent(editingEvent.id);
                        setShowEditEventModal(false);
                      }
                    }}
                    className="border-red-500 text-red-500 hover:bg-red-500/10"
                  >
                    Delete
                  </Button>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowEditEventModal(false)}
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        updateEvent(editingEvent);
                        setShowEditEventModal(false);
                      }}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Unsaved Changes Prompt */}
          {showSavePrompt && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-[#252525] rounded-lg shadow-lg p-6 w-full max-w-md border border-white/10">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  Unsaved Changes
                </h2>
                <p className="text-white/70 mb-6">
                  You have unsaved changes. Would you like to save them before
                  continuing?
                </p>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      completeNavigation();
                      setHasUnsavedChanges(false);
                    }}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    Discard Changes
                  </Button>
                  <Button
                    onClick={async () => {
                      await saveChanges();
                      completeNavigation();
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </AuthCheck>
  );
} 
