'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Sidebar from '@/components/Sidebar';
import AuthCheck from '@/components/AuthCheck';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Save, Plus, Trash2 } from 'lucide-react';

export default function SchedulingRulesPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Scheduling preferences
  const [maxTaskDuration, setMaxTaskDuration] = useState(60); // in minutes
  const [maxLongTaskDuration, setMaxLongTaskDuration] = useState(120); // in minutes
  const [longTaskThreshold, setLongTaskThreshold] = useState(120); // in minutes
  const [priorityWeight, setPriorityWeight] = useState(0.7);
  const [timeWeight, setTimeWeight] = useState(0.3);
  const [randomnessFactor, setRandomnessFactor] = useState(0.2);
  const [workingDays, setWorkingDays] = useState({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: true,
  });
  
  // Time blocks when scheduling is allowed
  const [timeBlocks, setTimeBlocks] = useState([
    { id: '1', day: 'weekday', startTime: '07:00', endTime: '20:00', enabled: true },
  ]);

  // Load user preferences
  useEffect(() => {
    if (user) {
      fetchUserPreferences();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const fetchUserPreferences = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/scheduling-rules?userId=${user.uid}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Update state with fetched preferences
        if (data) {
          setMaxTaskDuration(data.maxTaskDuration || 60);
          setMaxLongTaskDuration(data.maxLongTaskDuration || 120);
          setLongTaskThreshold(data.longTaskThreshold || 120);
          setPriorityWeight(data.priorityWeight || 0.7);
          setTimeWeight(data.timeWeight || 0.3);
          setRandomnessFactor(data.randomnessFactor || 0.2);
          setWorkingDays(data.workingDays || {
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: false,
            sunday: false,
          });
          setTimeBlocks(data.timeBlocks || [
            { id: '1', day: 'weekday', startTime: '09:00', endTime: '17:00', enabled: true },
          ]);
        }
      } else {
        // If no preferences found, keep defaults
        console.log('No preferences found, using defaults');
      }
    } catch (error) {
      console.error('Error fetching scheduling preferences:', error);
      setError('Failed to load your scheduling preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async () => {
    if (!user) return;
    
    try {
      setIsSaving(true);
      setError(null);
      
      const preferences = {
        userId: user.uid,
        maxTaskDuration,
        maxLongTaskDuration,
        longTaskThreshold,
        priorityWeight,
        timeWeight,
        randomnessFactor,
        workingDays,
        timeBlocks,
      };
      
      const response = await fetch('/api/scheduling-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });
      
      if (response.ok) {
        setSuccessMessage('Scheduling preferences saved successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving scheduling preferences:', error);
      setError(error instanceof Error ? error.message : 'Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const addTimeBlock = () => {
    const newId = (timeBlocks.length + 1).toString();
    setTimeBlocks([
      ...timeBlocks,
      { id: newId, day: 'weekday', startTime: '09:00', endTime: '17:00', enabled: true }
    ]);
  };

  const updateTimeBlock = (id: string, field: string, value: any) => {
    setTimeBlocks(timeBlocks.map(block => 
      block.id === id ? { ...block, [field]: value } : block
    ));
  };

  const removeTimeBlock = (id: string) => {
    setTimeBlocks(timeBlocks.filter(block => block.id !== id));
  };

  const toggleDay = (day: keyof typeof workingDays) => {
    setWorkingDays({
      ...workingDays,
      [day]: !workingDays[day]
    });
  };

  return (
    <AuthCheck>
      <div className="flex min-h-screen bg-[#121212]">
        <Sidebar />
        
        <main className="flex-1 p-6 ml-64">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Scheduling Rules</h1>
            
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-6">
                {error}
              </div>
            )}
            
            {successMessage && (
              <div className="bg-green-900/50 border border-green-500 text-green-200 px-4 py-3 rounded mb-6">
                {successMessage}
              </div>
            )}
            
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Task Duration Settings */}
                <Card className="bg-[#1E1E1E] border-[#333] text-white">
                  <CardHeader>
                    <CardTitle>Task Duration Settings</CardTitle>
                    <CardDescription className="text-gray-400">
                      Configure how long tasks should be scheduled for
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="maxTaskDuration">
                        Maximum duration for regular tasks: {maxTaskDuration} minutes
                      </Label>
                      <Slider 
                        id="maxTaskDuration"
                        min={15} 
                        max={120} 
                        step={15} 
                        value={[maxTaskDuration]} 
                        onValueChange={(value) => setMaxTaskDuration(value[0])} 
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="longTaskThreshold">
                        Long task threshold: {longTaskThreshold} minutes
                      </Label>
                      <Slider 
                        id="longTaskThreshold"
                        min={60} 
                        max={240} 
                        step={30} 
                        value={[longTaskThreshold]} 
                        onValueChange={(value) => setLongTaskThreshold(value[0])} 
                      />
                      <p className="text-sm text-gray-400">Tasks longer than this are considered "long tasks"</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="maxLongTaskDuration">
                        Maximum duration for long tasks: {maxLongTaskDuration} minutes
                      </Label>
                      <Slider 
                        id="maxLongTaskDuration"
                        min={60} 
                        max={240} 
                        step={30} 
                        value={[maxLongTaskDuration]} 
                        onValueChange={(value) => setMaxLongTaskDuration(value[0])} 
                      />
                      <p className="text-sm text-gray-400">Long tasks will be split into chunks of this duration</p>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Algorithm Weights */}
                <Card className="bg-[#1E1E1E] border-[#333] text-white">
                  <CardHeader>
                    <CardTitle>Scheduling Algorithm Settings</CardTitle>
                    <CardDescription className="text-gray-400">
                      Configure how tasks are prioritized when scheduling
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="priorityWeight">
                        Priority weight: {priorityWeight.toFixed(1)}
                      </Label>
                      <Slider 
                        id="priorityWeight"
                        min={0.1} 
                        max={0.9} 
                        step={0.1} 
                        value={[priorityWeight]} 
                        onValueChange={(value) => {
                          setPriorityWeight(value[0]);
                          setTimeWeight(parseFloat((1 - value[0]).toFixed(1)));
                        }} 
                      />
                      <p className="text-sm text-gray-400">Higher values give more importance to task priority</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="timeWeight">
                        Time weight: {timeWeight.toFixed(1)}
                      </Label>
                      <Slider 
                        id="timeWeight"
                        min={0.1} 
                        max={0.9} 
                        step={0.1} 
                        value={[timeWeight]} 
                        onValueChange={(value) => {
                          setTimeWeight(value[0]);
                          setPriorityWeight(parseFloat((1 - value[0]).toFixed(1)));
                        }} 
                      />
                      <p className="text-sm text-gray-400">Higher values give more importance to task duration</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="randomnessFactor">
                        Randomness factor: {randomnessFactor.toFixed(1)}
                      </Label>
                      <Slider 
                        id="randomnessFactor"
                        min={0} 
                        max={0.5} 
                        step={0.1} 
                        value={[randomnessFactor]} 
                        onValueChange={(value) => setRandomnessFactor(value[0])} 
                      />
                      <p className="text-sm text-gray-400">Adds variety to scheduling. Higher values create more randomness</p>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Working Days */}
                <Card className="bg-[#1E1E1E] border-[#333] text-white">
                  <CardHeader>
                    <CardTitle>Working Days</CardTitle>
                    <CardDescription className="text-gray-400">
                      Select which days you want to schedule tasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(workingDays).map(([day, enabled]) => (
                        <div key={day} className="flex items-center space-x-2">
                          <Switch 
                            id={`day-${day}`} 
                            checked={enabled}
                            onCheckedChange={() => toggleDay(day as keyof typeof workingDays)}
                          />
                          <Label htmlFor={`day-${day}`} className="capitalize">
                            {day}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                {/* Time Blocks */}
                <Card className="bg-[#1E1E1E] border-[#333] text-white">
                  <CardHeader>
                    <CardTitle>Available Time Blocks</CardTitle>
                    <CardDescription className="text-gray-400">
                      Define when tasks can be scheduled
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {timeBlocks.map((block) => (
                      <div key={block.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border border-[#333] rounded-md">
                        <div className="flex items-center space-x-2 min-w-[100px]">
                          <Switch 
                            id={`block-${block.id}-enabled`} 
                            checked={block.enabled}
                            onCheckedChange={(checked) => updateTimeBlock(block.id, 'enabled', checked)}
                          />
                          <Label htmlFor={`block-${block.id}-enabled`}>Active</Label>
                        </div>
                        
                        <div className="w-full md:w-auto">
                          <Select
                            value={block.day}
                            onValueChange={(value) => updateTimeBlock(block.id, 'day', value)}
                          >
                            <SelectTrigger className="w-full md:w-[180px] bg-[#252525]">
                              <SelectValue placeholder="Select days" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#252525]">
                              <SelectItem value="weekday">Weekdays</SelectItem>
                              <SelectItem value="weekend">Weekends</SelectItem>
                              <SelectItem value="monday">Monday</SelectItem>
                              <SelectItem value="tuesday">Tuesday</SelectItem>
                              <SelectItem value="wednesday">Wednesday</SelectItem>
                              <SelectItem value="thursday">Thursday</SelectItem>
                              <SelectItem value="friday">Friday</SelectItem>
                              <SelectItem value="saturday">Saturday</SelectItem>
                              <SelectItem value="sunday">Sunday</SelectItem>
                              <SelectItem value="all">All Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4 text-gray-400" />
                          <Input
                            type="time"
                            value={block.startTime}
                            onChange={(e) => updateTimeBlock(block.id, 'startTime', e.target.value)}
                            className="w-[120px] bg-[#252525]"
                          />
                          <span className="text-gray-400">to</span>
                          <Input
                            type="time"
                            value={block.endTime}
                            onChange={(e) => updateTimeBlock(block.id, 'endTime', e.target.value)}
                            className="w-[120px] bg-[#252525]"
                          />
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTimeBlock(block.id)}
                          className="ml-auto text-red-500 hover:text-red-400 hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    <Button 
                      variant="outline" 
                      onClick={addTimeBlock}
                      className="w-full mt-2 border-dashed"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add Time Block
                    </Button>
                  </CardContent>
                </Card>
                
                <div className="flex justify-end">
                  <Button 
                    onClick={savePreferences}
                    disabled={isSaving}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {isSaving ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" /> Save Preferences
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthCheck>
  );
} 