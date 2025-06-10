import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, StopCircle, ListChecks, Clock, CheckCircle2, XCircle, Edit3, Trash2, Save, AlertTriangle, Bell, Volume2, VolumeX, Timer } from 'lucide-react';

// --- LocalStorage Configuration ---
const LOCAL_STORAGE_KEY = 'focus-tracker-sessions';

// --- LocalStorage Helper Functions ---
const saveSessions = (sessions) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
};

const loadSessions = () => {
    try {
        const savedSessions = localStorage.getItem(LOCAL_STORAGE_KEY);
        return savedSessions ? JSON.parse(savedSessions) : [];
    } catch (error) {
        console.error("Error loading sessions from localStorage:", error);
        return [];
    }
};

// --- Helper Functions ---
const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// Simple timestamp class to replace Firebase's Timestamp
class LocalTimestamp {
    constructor(date) {
        this._date = date || new Date();
    }
    
    toDate() {
        return new Date(this._date);
    }
    
    toMillis() {
        return this.toDate().getTime();
    }
    
    static now() {
        return new LocalTimestamp(new Date());
    }
    
    static fromDate(date) {
        return new LocalTimestamp(date);
    }
    
    // For serialization to JSON
    toJSON() {
        return { _date: this._date.toISOString() };
    }
};

const FocusSessionItem = ({ session, onDeleteRequest, onEditSession, isEditing, editingText, setEditingText, onSaveEdit }) => {
    const duration = session.durationSeconds ? formatTime(session.durationSeconds) : 'N/A';
    const startTime = session.startTime && session.startTime._date ? new Date(session.startTime._date).toLocaleString() : 'N/A';
    const endTime = session.endTime && session.endTime._date ? new Date(session.endTime._date).toLocaleString() : 'N/A';
    
    // Format timer information if a timer was used
    const timerInfo = session.timerUsed ? 
        `${Math.floor(session.timerDuration / 60)} min timer ${session.timerCompleted ? 'completed' : 'used'}` : null;

    return (
        <li className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow duration-200 ease-in-out mb-3 text-gray-800">
            {isEditing ? (
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="flex-grow p-2 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-gray-800"
                        aria-label="Edit task name"
                    />
                    <button
                        onClick={() => onSaveEdit(session.id)}
                        className="p-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                        aria-label="Save changes"
                    >
                        <Save size={18} />
                    </button>
                    <button
                        onClick={() => onEditSession(null, '')} // Cancel edit
                        className="p-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                        aria-label="Cancel edit"
                    >
                        <XCircle size={18} />
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex justify-between items-start">
                        <h3 className="text-lg font-semibold break-all">{session.taskName || "Untitled Session"}</h3>
                        <div className="flex space-x-2">
                            <button
                                onClick={() => onEditSession(session.id, session.taskName)}
                                className="text-blue-500 hover:text-blue-700 transition-colors"
                                aria-label="Edit task"
                            >
                                <Edit3 size={18} />
                            </button>
                            <button
                                onClick={() => onDeleteRequest(session.id)}
                                className="text-red-500 hover:text-red-700 transition-colors"
                                aria-label="Delete task"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                        <Clock size={14} className="inline mr-1" /> Duration: {duration}
                    </p>
                    {timerInfo && (
                        <p className="text-xs mt-1 text-blue-600 flex items-center">
                            <Timer size={12} className="inline mr-1" />
                            {timerInfo}
                            {session.timerCompleted && <Bell size={12} className="ml-1 text-green-600" />}
                        </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Started: {startTime}</p>
                    <p className="text-xs text-gray-500">Ended: {endTime}</p>
                </>
            )}
        </li>
    );
};


const App = () => {
    const [taskName, setTaskName] = useState('');
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Timer settings
    const [timerDuration, setTimerDuration] = useState(25 * 60); // Default 25 minutes in seconds
    const [customTimerActive, setCustomTimerActive] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(0);
    
    // Sound settings
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [selectedSound, setSelectedSound] = useState('bell.mp3');
    const [showTimerSettings, setShowTimerSettings] = useState(false);
    
    // Available sounds
    const availableSounds = [
        { id: 'bell.mp3', name: 'Bell' },
        { id: 'chime.mp3', name: 'Chime' },
        { id: 'complete.mp3', name: 'Complete' }
    ];

    const timerRef = useRef(null);
    const sessionStartTimeRef = useRef(null);
    const audioRef = useRef(null);

    const [editingSessionId, setEditingSessionId] = useState(null);
    const [editingTaskName, setEditingTaskName] = useState('');

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState(null);

    // --- Global Styles Effect ---
    useEffect(() => {
        const styleId = 'custom-app-styles';
        if (!document.getElementById(styleId)) {
            const styleElement = document.createElement('style');
            styleElement.id = styleId;
            styleElement.innerHTML = `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #334155; /* slate-700 */
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #475569; /* slate-600 */
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #64748b; /* slate-500 */
                }
                .bg-slate-750 {
                    background-color: #3e4c5f; 
                }
            `;
            document.head.appendChild(styleElement);
        }
        // Not removing on unmount as these are global and App is likely root.
    }, []);


    // --- LocalStorage Data & Settings Loading Effect ---
    useEffect(() => {
        try {
            // Load sessions
            const savedSessions = loadSessions();
            
            // Sort sessions by start time descending (newest first)
            savedSessions.sort((a, b) => {
                const timeA = a.startTime && a.startTime._date ? new Date(a.startTime._date).getTime() : 0;
                const timeB = b.startTime && b.startTime._date ? new Date(b.startTime._date).getTime() : 0;
                return timeB - timeA;
            });
            
            setSessions(savedSessions);
            
            // Load timer settings
            const savedTimerDuration = localStorage.getItem('focus-timer-duration');
            if (savedTimerDuration) {
                setTimerDuration(parseInt(savedTimerDuration, 10));
            }
            
            // Load sound settings
            const savedSoundEnabled = localStorage.getItem('focus-sound-enabled');
            if (savedSoundEnabled !== null) {
                setSoundEnabled(savedSoundEnabled === 'true');
            }
            
            const savedSelectedSound = localStorage.getItem('focus-selected-sound');
            if (savedSelectedSound) {
                setSelectedSound(savedSelectedSound);
            }
            
            setIsLoading(false);
        } catch (err) {
            console.error("Error loading data from localStorage:", err);
            setError("Failed to load saved data. Local storage might not be available.");
            setIsLoading(false);
        }
    }, []);


    // --- Audio Element Effect ---
    useEffect(() => {
        // Create audio element when component mounts
        audioRef.current = new Audio(`${process.env.PUBLIC_URL}/sounds/${selectedSound}`);
        
        return () => {
            // Clean up audio element when component unmounts
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [selectedSound]);

    // --- Timer Effect ---
    useEffect(() => {
        if (isActive && !isPaused) {
            timerRef.current = setInterval(() => {
                setTimeElapsed(prevTime => prevTime + 1);
                
                // If custom timer is active, update the time remaining
                if (customTimerActive) {
                    setTimeRemaining(prev => {
                        const newTimeRemaining = prev - 1;
                        
                        // Check if timer has reached zero
                        if (newTimeRemaining <= 0) {
                            // Play sound notification if enabled
                            if (soundEnabled && audioRef.current) {
                                audioRef.current.play().catch(error => {
                                    console.error("Error playing sound:", error);
                                });
                            }
                            
                            return 0;
                        }
                        
                        return newTimeRemaining;
                    });
                }
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isActive, isPaused, customTimerActive, soundEnabled]);


    // --- Event Handlers ---
    const handleStartSession = useCallback(() => {
        setError(null); // Clear previous errors
        if (!taskName.trim()) {
            setError("Please enter a task name to start a session.");
            return;
        }
        
        setIsActive(true);
        setIsPaused(false);
        setTimeElapsed(0);
        sessionStartTimeRef.current = new Date();
        
        // If timer is enabled, set up the countdown
        if (customTimerActive) {
            setTimeRemaining(timerDuration);
        }
    }, [taskName, customTimerActive, timerDuration]);

    // Save settings to localStorage
    const saveSettings = useCallback(() => {
        localStorage.setItem('focus-timer-duration', timerDuration.toString());
        localStorage.setItem('focus-sound-enabled', soundEnabled.toString());
        localStorage.setItem('focus-selected-sound', selectedSound);
    }, [timerDuration, soundEnabled, selectedSound]);
    
    const handlePauseResumeSession = useCallback(() => {
        setIsPaused(!isPaused);
    }, [isPaused]);

    const handleEndSession = useCallback(() => {
        setIsActive(false);
        setIsPaused(false);
        clearInterval(timerRef.current);

        // Play completion sound if enabled
        if (soundEnabled && audioRef.current) {
            audioRef.current.play().catch(error => {
                console.error("Error playing sound:", error);
            });
        }

        const sessionData = {
            id: `session-${Date.now()}`, // Generate a unique ID
            taskName: taskName.trim() || "Untitled Session",
            startTime: LocalTimestamp.fromDate(sessionStartTimeRef.current),
            endTime: LocalTimestamp.now(),
            durationSeconds: timeElapsed,
            // Save timer settings with the session
            timerUsed: customTimerActive,
            timerDuration: customTimerActive ? timerDuration : null,
            timerCompleted: customTimerActive && timeRemaining === 0
        };

        try {
            // Add new session to the current sessions list
            const updatedSessions = [sessionData, ...sessions];
            setSessions(updatedSessions);
            saveSessions(updatedSessions);
            
            setTaskName('');
            setTimeElapsed(0);
            setTimeRemaining(0);
            setError(null);
        } catch (e) {
            console.error("Error saving session: ", e);
            setError("Failed to save session to local storage.");
        }
    }, [taskName, timeElapsed, sessions, customTimerActive, timerDuration, timeRemaining, soundEnabled]);

    const handleDeleteRequest = (sessionId) => {
        setSessionToDelete(sessionId);
        setShowDeleteConfirm(true);
        setError(null); // Clear other errors when prompting for delete
    };

    const cancelDeleteSession = () => {
        setShowDeleteConfirm(false);
        setSessionToDelete(null);
    };

    const confirmDeleteSession = () => {
        if (!sessionToDelete) {
            setError("Cannot delete session: Session not specified.");
            setShowDeleteConfirm(false);
            setSessionToDelete(null);
            return;
        }
        
        try {
            const updatedSessions = sessions.filter(session => session.id !== sessionToDelete);
            setSessions(updatedSessions);
            saveSessions(updatedSessions);
            
            setShowDeleteConfirm(false);
            setSessionToDelete(null);
            setError(null); // Clear any previous errors on success
        } catch (e) {
            console.error("Error deleting session: ", e);
            setError("Failed to delete session from local storage.");
            setShowDeleteConfirm(false); // Still hide confirm dialog on error
            setSessionToDelete(null);
        }
    };

    const handleEditSession = (sessionId, currentTaskName) => {
        setEditingSessionId(sessionId);
        setEditingTaskName(sessionId ? currentTaskName : '');
        setError(null);
    };

    const handleSaveEdit = (sessionId) => {
        if (!editingTaskName.trim()) {
            setError("Task name cannot be empty.");
            return;
        }
        
        try {
            const updatedSessions = sessions.map(session => 
                session.id === sessionId 
                    ? { ...session, taskName: editingTaskName.trim() } 
                    : session
            );
            
            setSessions(updatedSessions);
            saveSessions(updatedSessions);
            
            setEditingSessionId(null);
            setEditingTaskName('');
            setError(null);
        } catch (e) {
            console.error("Error updating session: ", e);
            setError("Failed to update session name in local storage.");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 flex flex-col items-center justify-center p-4 text-white font-sans">
                <div className="animate-pulse text-2xl">Loading Focus App...</div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 flex flex-col items-center p-4 sm:p-6 md:p-8 text-white font-sans">
            <header className="w-full max-w-3xl mb-8 text-center">
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Focus Tracker</h1>
                <p className="text-xs text-slate-400 mt-1">Local Storage Version</p>
            </header>

            {error && (
                <div className="w-full max-w-md bg-red-500 text-white p-3 rounded-md mb-6 text-center shadow-lg flex items-center justify-center">
                    <AlertTriangle size={20} className="inline mr-2" /> {error}
                    <button onClick={() => setError(null)} className="ml-auto text-sm underline hover:text-red-200">Dismiss</button>
                </div>
            )}

            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out">
                    <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl text-white max-w-sm w-full transform transition-all duration-300 ease-in-out scale-100">
                        <h3 className="text-xl font-semibold mb-4 text-slate-100">Confirm Deletion</h3>
                        <p className="mb-6 text-slate-300">Are you sure you want to delete this session? This action cannot be undone.</p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={cancelDeleteSession}
                                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteSession}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <main className="w-full max-w-md bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl space-y-6">
                <section aria-labelledby="timer-heading">
                    <h2 id="timer-heading" className="sr-only">Focus Timer</h2>
                    <div className="text-center mb-6">
                        {/* Main Timer Display */}
                        <div className={`text-6xl sm:text-7xl font-mono p-4 rounded-lg inline-block transition-all duration-300 ease-in-out ${isActive && !isPaused ? 'text-green-400 animate-pulse' : isPaused ? 'text-yellow-400' : 'text-slate-300'}`}>
                            {formatTime(timeElapsed)}
                        </div>
                        
                        {/* Countdown Timer (if enabled) */}
                        {isActive && customTimerActive && timeRemaining > 0 && (
                            <div className="mt-2">
                                <div className="flex items-center justify-center gap-2">
                                    <Timer size={16} className="text-blue-400" />
                                    <p className={`font-mono ${timeRemaining < 60 ? 'text-red-400' : 'text-blue-400'}`}>
                                        {formatTime(timeRemaining)} remaining
                                    </p>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                                    <div 
                                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000 ease-linear"
                                        style={{ width: `${(timeRemaining / timerDuration) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                        
                        {/* Timer Finished Notification */}
                        {isActive && customTimerActive && timeRemaining === 0 && (
                            <div className="mt-3 text-red-400 animate-pulse flex items-center justify-center">
                                <Bell size={16} className="mr-1" />
                                <span>Timer complete!</span>
                            </div>
                        )}
                    </div>

                    {!isActive ? (
                        <div className="space-y-4">
                            <input
                                type="text"
                                value={taskName}
                                onChange={(e) => { setTaskName(e.target.value); setError(null); }}
                                placeholder="What are you focusing on?"
                                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white"
                                aria-label="Task name"
                            />
                            
                            {/* Timer Settings Toggle */}
                            <div className="flex justify-between items-center">
                                <button 
                                    onClick={() => setShowTimerSettings(!showTimerSettings)}
                                    className="flex items-center text-slate-300 hover:text-white transition-colors"
                                >
                                    <Timer size={18} className="mr-1" />
                                    <span>Timer Settings</span>
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        setSoundEnabled(!soundEnabled);
                                        saveSettings();
                                    }}
                                    className="flex items-center text-slate-300 hover:text-white transition-colors"
                                    aria-label={soundEnabled ? "Disable sound" : "Enable sound"}
                                >
                                    {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                                </button>
                            </div>
                            
                            {/* Timer Settings Panel */}
                            {showTimerSettings && (
                                <div className="bg-slate-700 p-4 rounded-lg space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label htmlFor="use-timer" className="text-slate-300">Use Timer</label>
                                        <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full">
                                            <input
                                                type="checkbox"
                                                id="use-timer"
                                                className="absolute w-6 h-6 transition duration-200 ease-in-out transform bg-white rounded-full appearance-none cursor-pointer peer checked:translate-x-6 checked:bg-blue-500"
                                                checked={customTimerActive}
                                                onChange={() => setCustomTimerActive(!customTimerActive)}
                                            />
                                            <label
                                                htmlFor="use-timer"
                                                className="block w-full h-full overflow-hidden rounded-full cursor-pointer bg-slate-600 peer-checked:bg-blue-300"
                                            ></label>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <label htmlFor="timer-duration" className="text-slate-300">
                                            Focus Duration: {Math.floor(timerDuration / 60)} minutes
                                        </label>
                                        <input
                                            type="range"
                                            id="timer-duration"
                                            min="5"
                                            max="120"
                                            step="5"
                                            value={timerDuration / 60}
                                            onChange={(e) => {
                                                const mins = parseInt(e.target.value, 10);
                                                setTimerDuration(mins * 60);
                                                saveSettings();
                                            }}
                                            className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <label className="text-slate-300">Notification Sound</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {availableSounds.map(sound => (
                                                <button
                                                    key={sound.id}
                                                    onClick={() => {
                                                        setSelectedSound(sound.id);
                                                        saveSettings();
                                                        
                                                        // Preview the sound
                                                        if (soundEnabled && audioRef.current) {
                                                            audioRef.current.pause();
                                                            audioRef.current.currentTime = 0;
                                                            audioRef.current.src = `${process.env.PUBLIC_URL}/sounds/${sound.id}`;
                                                            audioRef.current.play().catch(e => console.error("Error playing sound:", e));
                                                        }
                                                    }}
                                                    className={`p-2 rounded-md flex items-center justify-center 
                                                        ${selectedSound === sound.id 
                                                            ? 'bg-blue-500 text-white' 
                                                            : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}
                                                >
                                                    <Bell size={14} className="mr-1" />
                                                    {sound.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <button
                                onClick={handleStartSession}
                                className="w-full flex items-center justify-center p-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 shadow-md"
                            >
                                <Play size={20} className="mr-2" /> Start Focus
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                            <button
                                onClick={handlePauseResumeSession}
                                className={`w-full flex items-center justify-center p-3 font-semibold rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-opacity-75 shadow-md ${isPaused ? 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400' : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-400'} text-white`}
                            >
                                {isPaused ? <Play size={20} className="mr-2" /> : <Pause size={20} className="mr-2" />}
                                {isPaused ? 'Resume' : 'Pause'}
                            </button>
                            <button
                                onClick={handleEndSession}
                                className="w-full flex items-center justify-center p-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 shadow-md"
                            >
                                <StopCircle size={20} className="mr-2" /> End Session
                            </button>
                        </div>
                    )}
                </section>

                <section aria-labelledby="sessions-heading" className="mt-8 pt-6 border-t border-slate-700">
                    <h2 id="sessions-heading" className="text-2xl font-semibold text-slate-100 mb-4 flex items-center">
                        <ListChecks size={28} className="mr-3 text-blue-400" /> Completed Sessions
                    </h2>
                    {isLoading && !sessions.length ? (
                        <p className="text-slate-400 text-center py-4">Loading sessions...</p>
                    ) : !isLoading && sessions.length === 0 ? (
                        <div className="text-center py-6 bg-slate-750 rounded-lg">
                             <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
                            <p className="text-slate-300 text-lg">No sessions completed yet.</p>
                            <p className="text-slate-400 text-sm">Start a new focus session to see it here!</p>
                        </div>
                    ) : (
                        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                            {sessions.map((session) => (
                                <FocusSessionItem
                                    key={session.id}
                                    session={session}
                                    onDeleteRequest={handleDeleteRequest}
                                    onEditSession={handleEditSession}
                                    isEditing={editingSessionId === session.id}
                                    editingText={editingTaskName}
                                    setEditingText={setEditingTaskName}
                                    onSaveEdit={handleSaveEdit}
                                />
                            ))}
                        </ul>
                    )}
                </section>
            </main>
            <footer className="mt-12 text-center text-slate-400 text-sm">
                <p>Track your productivity, one session at a time.</p>
                <p>&copy; {new Date().getFullYear()} Focus Tracker App</p>
            </footer>
        </div>
    );
};

export default App;

