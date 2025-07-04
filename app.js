import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore'; // Added deleteDoc
import { Play, Pause, StopCircle, ListChecks, Clock, CheckCircle2, XCircle, Edit3, Trash2, Save, AlertTriangle } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "YOUR_API_KEY", authDomain: "YOUR_AUTH_DOMAIN", projectId: "YOUR_PROJECT_ID" };
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-focus-app';

// --- Initialize Firebase ---
let app;
let auth;
let db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    // setLogLevel('debug'); // Uncomment for Firebase debugging
} catch (error) {
    console.error("Error initializing Firebase:", error);
}

// --- Helper Functions ---
const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const FocusSessionItem = ({ session, onDeleteRequest, onEditSession, isEditing, editingText, setEditingText, onSaveEdit }) => {
    const duration = session.durationSeconds ? formatTime(session.durationSeconds) : 'N/A';
    const startTime = session.startTime instanceof Timestamp ? session.startTime.toDate().toLocaleString() : 'N/A';
    const endTime = session.endTime instanceof Timestamp ? session.endTime.toDate().toLocaleString() : 'N/A';

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

    const [userId, setUserId] = useState(null);
    const [authReady, setAuthReady] = useState(false);

    const timerRef = useRef(null);
    const sessionStartTimeRef = useRef(null);

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


    // --- Firebase Authentication Effect ---
    useEffect(() => {
        if (!auth) {
            setError("Firebase authentication is not available.");
            setIsLoading(false);
            setAuthReady(true);
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                    if (token) {
                        await signInWithCustomToken(auth, token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (authError) {
                    console.error("Error during sign-in:", authError);
                    setError("Could not sign in. Some features might be unavailable.");
                }
            }
            setAuthReady(true);
        });
        return () => unsubscribe();
    }, []);


    // --- Firestore Data Fetching Effect ---
    useEffect(() => {
        if (!authReady || !userId || !db) {
            if (authReady && !userId) setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const sessionsCollectionPath = `artifacts/${appId}/users/${userId}/completedSessions`;
        const q = query(collection(db, sessionsCollectionPath)); // Removed orderBy

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedSessions = [];
            querySnapshot.forEach((doc) => {
                fetchedSessions.push({ id: doc.id, ...doc.data() });
            });

            // Sort in JavaScript
            fetchedSessions.sort((a, b) => {
                const timeA = a.startTime instanceof Timestamp ? a.startTime.toMillis() : 0;
                const timeB = b.startTime instanceof Timestamp ? b.startTime.toMillis() : 0;
                return timeB - timeA; // For descending order (newest first)
            });

            setSessions(fetchedSessions);
            setIsLoading(false);
            setError(null);
        }, (err) => {
            console.error("Error fetching sessions:", err);
            setError("Failed to load sessions. Please try again later.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [authReady, userId]);


    // --- Timer Effect ---
    useEffect(() => {
        if (isActive && !isPaused) {
            timerRef.current = setInterval(() => {
                setTimeElapsed(prevTime => prevTime + 1);
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isActive, isPaused]);


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
    }, [taskName]);

    const handlePauseResumeSession = useCallback(() => {
        setIsPaused(!isPaused);
    }, [isPaused]);

    const handleEndSession = useCallback(async () => {
        if (!authReady || !userId || !db) {
            setError("Cannot save session: Not connected to the database.");
            setIsActive(false);
            setIsPaused(false);
            clearInterval(timerRef.current);
            return;
        }

        setIsActive(false);
        setIsPaused(false);
        clearInterval(timerRef.current);

        const sessionData = {
            taskName: taskName.trim() || "Untitled Session",
            startTime: Timestamp.fromDate(sessionStartTimeRef.current),
            endTime: serverTimestamp(),
            durationSeconds: timeElapsed,
            userId: userId,
        };

        try {
            const sessionsCollectionPath = `artifacts/${appId}/users/${userId}/completedSessions`;
            await addDoc(collection(db, sessionsCollectionPath), sessionData);
            setTaskName('');
            setTimeElapsed(0);
            setError(null); // Clear any previous errors on success
        } catch (e) {
            console.error("Error adding document: ", e);
            setError("Failed to save session. Please check your connection and try again.");
        }
    }, [taskName, timeElapsed, userId, authReady]);

    const handleDeleteRequest = (sessionId) => {
        setSessionToDelete(sessionId);
        setShowDeleteConfirm(true);
        setError(null); // Clear other errors when prompting for delete
    };

    const cancelDeleteSession = () => {
        setShowDeleteConfirm(false);
        setSessionToDelete(null);
    };

    const confirmDeleteSession = async () => {
        if (!sessionToDelete || !authReady || !userId || !db) {
            setError("Cannot delete session: Not connected or session not specified.");
            setShowDeleteConfirm(false);
            setSessionToDelete(null);
            return;
        }
        try {
            const sessionDocPath = `artifacts/${appId}/users/${userId}/completedSessions/${sessionToDelete}`;
            await deleteDoc(doc(db, sessionDocPath));
            setShowDeleteConfirm(false);
            setSessionToDelete(null);
            setError(null); // Clear any previous errors on success
        } catch (e) {
            console.error("Error deleting document: ", e);
            setError("Failed to delete session.");
            setShowDeleteConfirm(false); // Still hide confirm dialog on error
            setSessionToDelete(null);
        }
    };

    const handleEditSession = (sessionId, currentTaskName) => {
        setEditingSessionId(sessionId);
        setEditingTaskName(sessionId ? currentTaskName : '');
        setError(null);
    };

    const handleSaveEdit = async (sessionId) => {
        if (!authReady || !userId || !db) {
             setError("Cannot update session: Not connected.");
             return;
        }
        if (!editingTaskName.trim()) {
            setError("Task name cannot be empty.");
            return;
        }
        try {
            const sessionDocPath = `artifacts/${appId}/users/${userId}/completedSessions/${sessionId}`;
            await setDoc(doc(db, sessionDocPath), { taskName: editingTaskName.trim() }, { merge: true });
            setEditingSessionId(null);
            setEditingTaskName('');
            setError(null);
        } catch (e) {
            console.error("Error updating document: ", e);
            setError("Failed to update session name.");
        }
    };

    if (!authReady && isLoading) {
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
                {userId && <p className="text-xs text-slate-400 mt-1">User ID: {userId}</p>}
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
                        <div className={`text-6xl sm:text-7xl font-mono p-4 rounded-lg inline-block transition-all duration-300 ease-in-out ${isActive && !isPaused ? 'text-green-400 animate-pulse' : isPaused ? 'text-yellow-400' : 'text-slate-300'}`}>
                            {formatTime(timeElapsed)}
                        </div>
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
                            <button
                                onClick={handleStartSession}
                                disabled={!authReady || (authReady && !userId)} // Disable if auth not ready or no user
                                className="w-full flex items-center justify-center p-3 bg-green-500 hover:bg-green-600 disabled:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 shadow-md"
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

