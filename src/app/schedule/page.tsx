"use client";

import { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, Plus, Trash2, Edit, Check, X, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { format, addDays, subDays, startOfWeek, endOfWeek, parseISO, isValid, eachDayOfInterval, addWeeks, subWeeks, isSameDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarEvent } from "@/lib/googleCalendar";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import AuthCheck from "@/components/AuthCheck";

// Time slots from 3 AM to 11 PM
const TIME_SLOTS = Array.from({ length: 21 }, (_, i) => i + 3);

// Remove hardcoded config
// const config = {
//   time_zone: "Australia/Brisbane"
// };

export default function SchedulePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [originalEvents, setOriginalEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [showSavePrompt, setShowSavePrompt] = useState<boolean>(false);
  const [pendingNavigation, setPendingNavigation] = useState<Date | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userTimeZone, setUserTimeZone] = useState<string>("UTC");
  
  // Detect user's timezone on component mount
  useEffect(() => {
    try {
      // Check if timezone is stored in cookie
      const storedTimezone = document.cookie
        .split('; ')
        .find(row => row.startsWith('user_timezone='))
        ?.split('=')[1];
      
      if (storedTimezone) {
        console.log("Using timezone from cookie:", storedTimezone);
        setUserTimeZone(storedTimezone);
      } else {
        // Detect timezone from browser
        const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        console.log("Detected user timezone:", detectedTimeZone);
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
  
  // New event form state
  const [newEvent, setNewEvent] = useState({
    summary: "",
    description: "",
    startDateTime: "",
    endDateTime: "",
    duration: 60 // Default duration in minutes
  });
  
  // Track deleted events
  const [deletedEvents, setDeletedEvents] = useState<string[]>([]);

  // Ref for tracking beforeunload event
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  
  // Update ref when state changes
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Add beforeunload event listener
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
    e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Check authentication status and fetch events
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true);
        
        // Check if we have an access token in cookies
        const response = await fetch("/api/auth/check", {
          method: "GET",
          credentials: "include"
        });
        
        if (response.ok) {
          setIsAuthenticated(true);
          fetchEvents();
        } else {
          setIsAuthenticated(false);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Error checking authentication:", err);
        setError("Failed to check authentication status");
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, [weekStart]);

  // Fetch events for the selected week
  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      
      const start = weekStart;
      const end = endOfWeek(weekStart);
      
      const response = await fetch(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`,
        {
          method: "GET",
          credentials: "include"
        }
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }
      
      const data = await response.json();
      const fetchedEvents = data.events || [];
      setEvents(fetchedEvents);
      setOriginalEvents(JSON.parse(JSON.stringify(fetchedEvents))); // Deep copy
      setHasUnsavedChanges(false);
      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching events:", err);
      setError("Failed to fetch calendar events");
      setIsLoading(false);
    }
  };

  // Navigate to previous week
  const goToPreviousWeek = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(subWeeks(weekStart, 1));
      setShowSavePrompt(true);
    } else {
      setWeekStart(subWeeks(weekStart, 1));
    }
  };

  // Navigate to next week
  const goToNextWeek = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(addWeeks(weekStart, 1));
      setShowSavePrompt(true);
    } else {
      setWeekStart(addWeeks(weekStart, 1));
    }
  };

  // Navigate to today
  const goToToday = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(startOfWeek(new Date()));
      setShowSavePrompt(true);
    } else {
      setWeekStart(startOfWeek(new Date()));
      setSelectedDate(new Date());
    }
  };

  // Complete navigation after handling unsaved changes
  const completeNavigation = () => {
    if (pendingNavigation) {
      setWeekStart(pendingNavigation);
      setPendingNavigation(null);
    }
    setShowSavePrompt(false);
  };

  // Create a new event
  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Don't append Z suffix as we'll explicitly set the time zone
      const formattedStartDateTime = newEvent.startDateTime;
      const formattedEndDateTime = newEvent.endDateTime;
      
      const newEventData: CalendarEvent = {
        id: `temp-${Date.now()}`,
        summary: newEvent.summary,
        description: newEvent.description || "",
        start: {
          dateTime: formattedStartDateTime,
          timeZone: userTimeZone
        },
        end: {
          dateTime: formattedEndDateTime,
          timeZone: userTimeZone
        },
        isNew: true,
        isTemp: true
      };
      
      console.log("Creating new event in UI:", newEventData);
      
      // Add to local events array
      setEvents(prev => [...prev, newEventData]);
      setHasUnsavedChanges(true);
      
      // Reset form and close modal
      setNewEvent({
        summary: "",
        description: "",
        startDateTime: "",
        endDateTime: "",
        duration: 60 // Default duration in minutes
      });
      setIsCreatingEvent(false);
    } catch (err) {
      console.error("Error creating event:", err);
      setError("Failed to create event");
    }
  };

  // Update an event
  const updateEvent = (updatedEvent: CalendarEvent) => {
    console.log("Updating event in UI:", updatedEvent);
    setEvents(prev => 
      prev.map(event => 
        event.id === updatedEvent.id 
          ? { ...updatedEvent, isUpdated: true } 
          : event
      )
    );
    setEditingEvent(null);
    setHasUnsavedChanges(true);
  };

  // Delete an event
  const deleteEvent = (eventId: string) => {
    console.log("Deleting event from UI:", eventId);
    setEvents(prev => prev.filter(event => event.id !== eventId));
    
    // If this is a real event (not a temp one), add to deletedEvents
    if (!eventId.startsWith('temp-')) {
      setDeletedEvents(prev => [...prev, eventId]);
    }
    
    setHasUnsavedChanges(true);
    setEditingEvent(null);
  };

  // Save all changes to Google Calendar
  const saveChanges = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      console.log("Starting to save changes to Google Calendar");
      
      // Find created events (those with isTemp flag)
      const createdEvents = events.filter(event => event.isTemp === true);
      console.log(`Found ${createdEvents.length} new events to create:`, createdEvents);
      
      // Find updated events (those with isUpdated flag)
      const updatedEvents = events.filter(event => event.isUpdated === true);
      console.log(`Found ${updatedEvents.length} events to update:`, updatedEvents);
      
      // Deleted events are tracked in the deletedEvents state
      console.log(`Found ${deletedEvents.length} events to delete:`, deletedEvents);
      
      // Process created events
      for (const event of createdEvents) {
        try {
          console.log("Creating event:", event);
          
          // Don't append Z suffix as we'll explicitly set the time zone
          const startDateTime = event.start.dateTime;
          const endDateTime = event.end.dateTime;
          
          const response = await fetch("/api/calendar/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: event.summary,
              description: event.description || "",
              startDateTime: startDateTime,
              endDateTime: endDateTime,
              timeZone: userTimeZone
            }),
            credentials: "include"
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error("Error response from API:", errorData);
            throw new Error(`Failed to create event: ${errorData.error || response.statusText}`);
          }
          
          const result = await response.json();
          console.log("Event created successfully:", result);
          
          // Update the event in state with the real ID
          setEvents(prev => 
            prev.map(e => 
              e.id === event.id 
                ? { ...result.event, isNew: false, isTemp: false } 
                : e
            )
          );
        } catch (err) {
          console.error("Error creating event:", err);
          throw err;
        }
      }
      
      // Process updated events
      for (const event of updatedEvents) {
        try {
          console.log("Updating event:", event);
          // Don't append Z suffix as we'll explicitly set the time zone
          const startDateTime = event.start.dateTime;
          const endDateTime = event.end.dateTime;
          
          const response = await fetch("/api/calendar/events", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId: event.id,
              updates: {
                summary: event.summary,
                description: event.description || "",
                start: {
                  dateTime: startDateTime,
                  timeZone: userTimeZone
                },
                end: {
                  dateTime: endDateTime,
                  timeZone: userTimeZone
                }
              }
            }),
            credentials: "include"
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error("Error response from API:", errorData);
            throw new Error(`Failed to update event: ${errorData.error || response.statusText}`);
          }
          
          const result = await response.json();
          console.log("Event updated successfully:", result);
          
          // Update the event in state to remove the isUpdated flag
          setEvents(prev => 
            prev.map(e => 
              e.id === event.id 
                ? { ...e, isUpdated: false } 
                : e
            )
          );
        } catch (err) {
          console.error("Error updating event:", err);
          throw err;
        }
      }
      
      // Process deleted events
      for (const eventId of deletedEvents) {
        try {
          console.log("Deleting event:", eventId);
          const response = await fetch(`/api/calendar/events?eventId=${eventId}`, {
            method: "DELETE",
            credentials: "include"
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error("Error response from API:", errorData);
            throw new Error(`Failed to delete event: ${errorData.error || response.statusText}`);
          }
          
          console.log("Event deleted successfully");
        } catch (err) {
          console.error("Error deleting event:", err);
          throw err;
        }
      }
      
      console.log("All changes saved successfully");
      
      // Clear deleted events
      setDeletedEvents([]);
      
      // Refresh events
      await fetchEvents();
      setHasUnsavedChanges(false);
      setIsLoading(false);
      setSuccessMessage("Changes saved successfully to Google Calendar!");
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error("Error saving changes:", err);
      setError(`Failed to save changes to Google Calendar: ${err.message}`);
      setIsLoading(false);
    }
  };

  // Format date for display
  const formatEventTime = (dateTimeString: string) => {
    const date = parseISO(dateTimeString);
    return isValid(date) ? format(date, "h:mm a") : "Invalid date";
  };

  // Format date for input fields
  const formatDateTimeForInput = (dateTimeString: string) => {
    try {
      // Parse the ISO date string
      const date = parseISO(dateTimeString);
      
      if (!isValid(date)) {
        console.error("Invalid date:", dateTimeString);
        return "";
      }
      
      // Format as YYYY-MM-DDTHH:MM (local time)
      return format(date, "yyyy-MM-dd'T'HH:mm");
    } catch (err) {
      console.error("Error formatting date for input:", err);
      return "";
    }
  };

  // Handle input changes for new event
  const handleNewEventChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === "duration") {
      // If duration changes, update the end time based on the start time
      const durationMinutes = parseInt(value);
      const startDate = newEvent.startDateTime ? parseISO(newEvent.startDateTime) : null;
      
      if (startDate && isValid(startDate)) {
        const endDate = new Date(startDate);
        endDate.setMinutes(startDate.getMinutes() + durationMinutes);
        
        setNewEvent(prev => ({
          ...prev,
          duration: durationMinutes,
          endDateTime: format(endDate, "yyyy-MM-dd'T'HH:mm")
        }));
      } else {
        setNewEvent(prev => ({
          ...prev,
          duration: durationMinutes
        }));
      }
    } else if (name === "startDateTime") {
      // If start time changes, update the end time based on duration
      const startDate = parseISO(value);
      
      if (isValid(startDate)) {
        const endDate = new Date(startDate);
        endDate.setMinutes(startDate.getMinutes() + newEvent.duration);
        
        setNewEvent(prev => ({
          ...prev,
          startDateTime: value,
          endDateTime: format(endDate, "yyyy-MM-dd'T'HH:mm")
        }));
      } else {
        setNewEvent(prev => ({
          ...prev,
          startDateTime: value
        }));
      }
    } else {
      setNewEvent(prev => ({ ...prev, [name]: value }));
    }
  };

  // Handle input changes for editing event
  const handleEditEventChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editingEvent) return;
    
    const { name, value } = e.target;
    
    if (name === "startDateTime") {
      setEditingEvent({
        ...editingEvent,
        start: {
          ...editingEvent.start,
          dateTime: value
        }
      });
    } else if (name === "endDateTime") {
      setEditingEvent({
        ...editingEvent,
        end: {
          ...editingEvent.end,
          dateTime: value
        }
      });
    } else {
      setEditingEvent({
        ...editingEvent,
        [name]: value
      });
    }
  };

  // Get days of the current week
  const getDaysOfWeek = () => {
    const start = weekStart;
    const end = endOfWeek(start);
    return eachDayOfInterval({ start, end });
  };

  // Get events for a specific day and hour
  const getEventsForTimeSlot = (day: Date, hour: number) => {
    const dayStr = format(day, "yyyy-MM-dd");
    
    return events.filter(event => {
      if (!event.start.dateTime || !event.end.dateTime) return false;
      
      const startDate = parseISO(event.start.dateTime);
      const endDate = parseISO(event.end.dateTime);
      const eventDay = format(startDate, "yyyy-MM-dd");
      
      if (eventDay !== dayStr) return false;
      
      const startHour = startDate.getHours();
      const endHour = endDate.getHours();
      
      // Check if event spans this hour
      return (startHour < hour && endHour > hour) || // Event spans the entire hour
             (startHour === hour && endHour > hour) || // Event starts in this hour
             (startHour < hour && endHour === hour && endDate.getMinutes() > 0) || // Event ends in this hour
             (startHour === hour && endHour === hour); // Event starts and ends in this hour
    });
  };

  // Calculate position and height of an event within the hour cell
  const calculateEventPosition = (event: CalendarEvent, hour: number) => {
    const startDate = parseISO(event.start.dateTime);
    const endDate = parseISO(event.end.dateTime);
    
    // Calculate top position (percentage within the cell)
    let topPercent = 0;
    if (startDate.getHours() === hour) {
      // Event starts in this hour, calculate position based on minutes
      topPercent = (startDate.getMinutes() / 60) * 100;
    }
    
    // Calculate height (percentage of the cell)
    let heightPercent = 100;
    if (startDate.getHours() === hour) {
      // Event starts in this hour
      const minutesInThisHour = 60 - startDate.getMinutes();
      
      if (endDate.getHours() === hour) {
        // Event also ends in this hour
        heightPercent = ((endDate.getMinutes() - startDate.getMinutes()) / 60) * 100;
      } else {
        // Event continues to next hour
        heightPercent = (minutesInThisHour / 60) * 100;
      }
    } else if (endDate.getHours() === hour) {
      // Event ends in this hour
      heightPercent = (endDate.getMinutes() / 60) * 100;
    }
    
    return {
      top: `${topPercent}%`,
      height: `${heightPercent}%`,
      minHeight: '20px' // Ensure very short events are still visible
    };
  };

  // Get color for event based on summary or id
  const getEventColor = (event: CalendarEvent) => {
    // Simple hash function for consistent colors
    const hash = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return Math.abs(hash);
  };

  const colorOptions = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 
      'bg-pink-500', 'bg-yellow-500', 'bg-red-500',
      'bg-indigo-500', 'bg-orange-500', 'bg-teal-500'
    ];
    
    const colorIndex = hash(event.summary || event.id) % colorOptions.length;
    return colorOptions[colorIndex];
  };

  // Format timezone for display
  const formatTimezone = (timezone: string): string => {
    try {
      // Get current date
      const date = new Date();
      
      // Format the date with the timezone name
      const timeString = date.toLocaleTimeString('en-US', { 
        timeZone: timezone,
        timeZoneName: 'short' 
      });
      
      // Extract the timezone abbreviation (like EST, PST)
      const tzAbbr = timeString.split(' ').pop();
      
      return tzAbbr || timezone;
    } catch (err) {
      console.error("Error formatting timezone:", err);
      return timezone;
    }
  };

  // Handle click on a time slot to create new event
  const handleTimeSlotClick = (day: Date, hour: number, e: React.MouseEvent<HTMLDivElement>) => {
    // Calculate which 15-minute segment was clicked based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const percentHeight = relativeY / rect.height;
    
    // Determine which 15-minute segment was clicked (0, 15, 30, 45)
    const minutes = Math.floor(percentHeight * 4) * 15;
    
    const startDateTime = new Date(day);
    startDateTime.setHours(hour, minutes, 0, 0);
    
    const endDateTime = new Date(startDateTime);
    // Default to 1-hour duration, but could be changed to 15, 30, 45 minutes if needed
    endDateTime.setHours(hour + 1, minutes, 0, 0);
    
    // Format dates in ISO format without the Z suffix
    setNewEvent({
      summary: "",
      description: "",
      startDateTime: format(startDateTime, "yyyy-MM-dd'T'HH:mm"),
      endDateTime: format(endDateTime, "yyyy-MM-dd'T'HH:mm"),
      duration: 60 // Default duration in minutes
    });
    
    setIsCreatingEvent(true);
  };

  return (
    <main className="min-h-screen bg-[#191919]">
      <AuthCheck>
        <div className="flex">
          <Sidebar />
          <div className="ml-64 flex-1">
            <div className="fixed bottom-0 left-64 right-0 top-0 overflow-y-auto bg-[#191919] p-6">
              <div className="mx-auto max-w-7xl">
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
                
                {!isAuthenticated ? (
                  <div className="text-center py-10">
                    <h2 className="text-xl mb-4 text-white">Connect to Google Calendar</h2>
                    <p className="mb-6 text-white/70">
                      Connect your Google Calendar to view and manage your events.
                    </p>
                    <Link href="/api/auth/google" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">
                      Connect Google Calendar
                    </Link>
                  </div>
                ) : (
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
                          {format(weekStart, "MMM")} – {format(endOfWeek(weekStart), "MMM yyyy")}
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
                                isSameDay(day, new Date()) ? 'bg-blue-600 text-white' : 'text-white'
                              }`}
                            >
                              <div className="text-sm">{format(day, "EEE")}</div>
                              <div className="text-xl font-bold">{format(day, "d")}</div>
                                  </div>
                          ))}
                                </div>
                        
                        {/* Time Grid */}
                        <div className="relative">
                          {TIME_SLOTS.map((hour) => (
                            <div key={hour} className="grid grid-cols-8 border-b border-white/10">
                              {/* Time Label */}
                              <div className="p-2 text-right text-white/50 text-xs border-r border-white/10">
                                {hour % 12 === 0 ? 12 : hour % 12} {hour >= 12 ? 'PM' : 'AM'}
                              </div>
                              
                              {/* Day Columns */}
                              {getDaysOfWeek().map((day, dayIndex) => {
                                const eventsInSlot = getEventsForTimeSlot(day, hour);
                                
                                return (
                                  <div 
                                    key={dayIndex} 
                                    className="relative h-16 border-r border-white/10 hover:bg-white/5 cursor-pointer"
                                    onClick={(e) => handleTimeSlotClick(day, hour, e)}
                                  >
                                    {eventsInSlot.map((event, eventIndex) => (
                                      <div 
                                        key={eventIndex}
                                        className={`absolute inset-x-0 mx-1 rounded p-1 text-white text-xs ${getEventColor(event)}`}
                                        style={{ 
                                          top: calculateEventPosition(event, hour).top,
                                          height: calculateEventPosition(event, hour).height,
                                          minHeight: calculateEventPosition(event, hour).minHeight,
                                          zIndex: 10 + eventIndex
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingEvent(event);
                                        }}
                                      >
                                        <div className="font-medium truncate">{event.summary}</div>
                                        <div className="truncate">
                                          {formatEventTime(event.start.dateTime)} - {formatEventTime(event.end.dateTime)}
                                        </div>
                                      </div>
                                    ))}
                              </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Create Event Modal */}
                    {isCreatingEvent && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-[#252525] rounded-lg shadow-lg p-6 w-full max-w-md border border-white/10">
                          <h2 className="text-xl font-semibold mb-4 text-white">Create New Event</h2>
                          
                          <form onSubmit={createEvent} className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-1 text-white">Title</label>
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
                              <label className="block text-sm font-medium mb-1 text-white">Description</label>
                              <textarea
                                name="description"
                                value={newEvent.description}
                                onChange={handleNewEventChange}
                                className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                                rows={3}
                              />
                            </div>
                            
                          <div>
                              <label className="block text-sm font-medium mb-1 text-white">Start</label>
                            <input
                                type="datetime-local"
                                name="startDateTime"
                                value={newEvent.startDateTime}
                                onChange={handleNewEventChange}
                                className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                                step="900" // 15-minute steps (900 seconds)
                              required
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium mb-1 text-white">Duration</label>
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
                              <label className="block text-sm font-medium mb-1 text-white">End</label>
                            <input
                                type="datetime-local"
                                name="endDateTime"
                                value={newEvent.endDateTime}
                                onChange={handleNewEventChange}
                                className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                                step="900" // 15-minute steps (900 seconds)
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
                              <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
                                Create Event
                              </Button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                    
                    {/* Edit Event Modal */}
                    {editingEvent && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-[#252525] rounded-lg shadow-lg p-6 w-full max-w-md border border-white/10">
                          <h2 className="text-xl font-semibold mb-4 text-white">Edit Event</h2>
                          
                          <form 
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (editingEvent) updateEvent(editingEvent);
                            }} 
                            className="space-y-4"
                          >
                            <div>
                              <label className="block text-sm font-medium mb-1 text-white">Title</label>
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
                              <label className="block text-sm font-medium mb-1 text-white">Description</label>
                              <textarea
                                name="description"
                                value={editingEvent.description || ""}
                                onChange={handleEditEventChange}
                                className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                                rows={3}
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium mb-1 text-white">Start</label>
                              <input
                                type="datetime-local"
                                name="startDateTime"
                                value={formatDateTimeForInput(editingEvent.start.dateTime)}
                                onChange={handleEditEventChange}
                                className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                                step="900" // 15-minute steps (900 seconds)
                                required
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium mb-1 text-white">End</label>
                              <input
                                type="datetime-local"
                                name="endDateTime"
                                value={formatDateTimeForInput(editingEvent.end.dateTime)}
                                onChange={handleEditEventChange}
                                className="w-full p-2 border rounded bg-white/10 border-white/20 text-white"
                                step="900" // 15-minute steps (900 seconds)
                                required
                              />
                            </div>
                            
                            <div className="flex justify-end space-x-2 pt-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditingEvent(null)}
                                className="border-white/20 text-white hover:bg-white/10"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  if (editingEvent && !editingEvent.isTemp) {
                                    setDeletedEvents(prev => [...prev, editingEvent.id]);
                                    setEvents(prev => prev.filter(e => e.id !== editingEvent.id));
                                    setHasUnsavedChanges(true);
                                    setEditingEvent(null);
                                  } else if (editingEvent && editingEvent.isTemp) {
                                    setEvents(prev => prev.filter(e => e.id !== editingEvent.id));
                                    setEditingEvent(null);
                                  }
                                }}
                                className="border-red-500 text-red-500 hover:bg-red-500/10"
                              >
                                Delete
                              </Button>
                              <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
                                Save
                              </Button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                    
                    {/* Save Changes Prompt */}
                    {showSavePrompt && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-[#252525] rounded-lg shadow-lg p-6 w-full max-w-md border border-white/10">
                          <h2 className="text-xl font-semibold mb-4 text-white">Unsaved Changes</h2>
                          <p className="text-white/70 mb-6">
                            You have unsaved changes. Would you like to save them before continuing?
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
                )}
              </div>
            </div>
          </div>
        </div>
      </AuthCheck>
    </main>
  );
} 