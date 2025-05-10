'use client';

import { useState, useEffect } from 'react';
import { useDeepgram } from '../lib/contexts/DeepgramContext';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';

// Local storage key for notes
const NOTES_STORAGE_KEY = 'local_notes';

// Get notes from local storage
const getNotes = () => {
  if (typeof window === 'undefined') return [];
  
  const storedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
  return storedNotes ? JSON.parse(storedNotes) : [];
};

// Save note to local storage
const saveNote = (text: string) => {
  const notes = getNotes();
  const newNote = {
    id: uuidv4(),
    text,
    timestamp: new Date().toISOString(),
  };
  
  notes.push(newNote);
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  return newNote;
};

export default function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const { connectToDeepgram, disconnectFromDeepgram, connectionState, realtimeTranscript } = useDeepgram();

  const handleStartRecording = async () => {
    await connectToDeepgram();
    setIsRecording(true);
  };

  const handleStopRecording = async () => {
    disconnectFromDeepgram();
    setIsRecording(false);
    
    // Save the note to local storage
    if (realtimeTranscript) {
      saveNote(realtimeTranscript);
    }
  };

  return (
    <div className="w-full max-w-md">
      <button
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        className={`w-full py-2 px-4 rounded-full ${
          isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
        } text-white font-bold`}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      {isRecording && (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="w-8 h-8 bg-blue-500 rounded-full mx-auto mb-4"
          />
          <p className="text-sm text-gray-600">{realtimeTranscript}</p>
        </div>
      )}
    </div>
  );
}