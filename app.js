import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import { Play, Pause, StopCircle, ListChecks, Clock, CheckCircle2, XCircle, Edit3, Trash2, Save, AlertTriangle, Sparkles, MessageSquareText, Brain } from 'lucide-react';

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

// --- Gemini API Key (leave empty, will be handled by environment) ---
const GEMINI_API_KEY = "";

// --- Focus Session Item Component ---
const FocusSessionItem = ({ session, onDeleteRequest, onEditSession, isEditing, editingText, setEditingText, onSaveEdit, onGetReflection }) => {
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
                    <button
                        onClick={() => onGetReflection(session.taskName, session.durationSeconds)}
                        className="mt-2 w-full flex items-center justify-center text-sm p-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-md transition-colors"
                        aria-label="Get reflection on this session"
                    >
                        <Sparkles size={16} className="mr-2" /> Get Reflection
                    </button>
                </>
            )}
        </li>
    );
};

// --- Modal Component (Generic for Gemini and Delete Confirm) ---
const Modal = ({ isOpen, onClose, title, children, primaryAction, primaryActionText, secondaryAction, secondaryActionText, primaryActionColor = "bg-blue-500 hover:bg-blue-600", primaryActionDisabled = false }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out">
            <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl text-white max-w-md w-full transform transition-all duration-300 ease-in-out scale-100">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-slate-100 flex items-center">
                        {title}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
                        <XCircle size={24} />
                    </button>
                </div>
                <div className="text-slate-300 max-h-60 overflow-y-auto custom-scrollbar p-1">
                    {children}
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    {secondaryAction && secondaryActionText && (
                         <button
                            onClick={secondaryAction}
                            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                            {secondaryActionText}
                        </button>
                    )}
                    {primaryAction && primaryActionText && (
                        <button
                            onClick={primaryAction}
                            disabled={primaryActionDisabled}
                            className={`px-4 py-2 ${primaryActionColor} text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 ${primaryActionDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {primaryActionText}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


const App = () => {
    const [taskName, setTaskName] = useState('');
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [isLoading, setIsLoading] = useState(true); // For initial data load
    const [error, setError] = useState(null);

    const [userId, setUserId] = useState(null);
    const [authReady, setAuthReady] = useState(false);

    const timerRef = useRef(null);
    const sessionStartTimeRef = useRef(null);

    const [editingSessionId, setEditingSessionId] = useState(null);
    const [editingTaskName, setEditingTaskName] = useState('');

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState(null);

    // --- Gemini API State ---
    const [isGenerating, setIsGenerating] = useState(false);
    const [geminiModalOpen, setGeminiModalOpen] = useState(false);
    const [geminiModalTitle, setGeminiModalTitle] = useState('');
    const [geminiModalContent, setGeminiModalContent] = useState('');

    // --- Global Styles Effect ---
    useEffect(() => {
        const styleId = 'custom-app-styles';
        if (!document.getElementById(styleId)) {
            const styleElement = document.createElement('style');
            styleElement.id = styleId;
            styleElement.innerHTML = `
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #334155; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
                .bg-slate-750 { background-color: #3e4c5f; }
            `;
            document.head.appendChild(styleElement);
        }
    }, []);

    // --- Firebase Authentication Effect ---
    useEffect(() => {
        if (!auth) {
            setError("Firebase authentication is not available.");
            setIsLoading(false); setAuthReady(true); return;
        }
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                    if (token) { await signInWithCustomToken(auth, token); }
                    else { await signInAnonymously(auth); }
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
            if (authReady && !userId) setIsLoading(false); return;
        }
        setIsLoading(true);
        const sessionsCollectionPath = `artifacts/${appId}/users/${userId}/completedSessions`;
        const q = query(collection(db, sessionsCollectionPath));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedSessions = [];
            querySnapshot.forEach((doc) => fetchedSessions.push({ id: doc.id, ...doc.data() }));
            fetchedSessions.sort((a, b) => (b.startTime?.toMillis() || 0) - (a.startTime?.toMillis() || 0));
            setSessions(fetchedSessions);
            setIsLoading(false); setError(null);
        }, (err) => {
            console.error("Error fetching sessions:", err);
            setError("Failed to load sessions."); setIsLoading(false);
        });
        return () => unsubscribe();
    }, [authReady, userId]);

    // --- Timer Effect ---
    useEffect(() => {
        if (isActive && !isPaused) {
            timerRef.current = setInterval(() => setTimeElapsed(prev => prev + 1), 1000);
        } else { clearInterval(timerRef.current); }
        return () => clearInterval(timerRef.current);
    }, [isActive, isPaused]);

    // --- Gemini API Call Function ---
    const callGeminiAPI = async (prompt) => {
        setIsGenerating(true);
        setGeminiModalContent(''); 

        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorData = await response.json();
                console.error("Gemini API Error:", errorData);
                throw new Error(`API request failed with status ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
            }
            const result = await response.json();
            if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
                setGeminiModalContent(result.candidates[0].content.parts[0].text);
            } else {
                console.error("Unexpected Gemini API response structure:", result);
                setGeminiModalContent("Sorry, couldn't generate content due to an unexpected response format.");
            }
        } catch (e) {
            console.error("Error calling Gemini API:", e);
            setGeminiModalContent(`Sorry, an error occurred: ${e.message}. Please check the console for details.`);
            setError(`Gemini API Error: ${e.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGetFocusTips = async () => {
        if (!taskName.trim()) {
            setError("Please enter a task name to get tips.");
            return;
        }
        setError(null);
        setGeminiModalTitle("✨ Focus Tips");
        setGeminiModalOpen(true);
        const prompt = `Provide 3 concise and actionable focus tips for someone working on a task called: "${taskName}". If the task name is generic or very short, provide general productivity tips. Format tips as a bulleted list.`;
        await callGeminiAPI(prompt);
    };

    const handleGetReflection = async (completedTaskName, durationSeconds) => {
        setError(null);
        setGeminiModalTitle("✨ Session Reflection");
        setGeminiModalOpen(true);
        const durationFormatted = formatTime(durationSeconds);
        const prompt = `I just completed a focus session on the task: "${completedTaskName}" for ${durationFormatted} (${durationSeconds > 60 ? `${Math.round(durationSeconds/60)} minutes` : `${durationSeconds} seconds`}). Provide a brief, positive, and encouraging reflection (2-3 sentences) on this accomplishment.`;
        await callGeminiAPI(prompt);
    };


    // --- Event Handlers ---
    const handleStartSession = useCallback(() => {
        setError(null);
        if (!taskName.trim()) { setError("Please enter a task name to start a session."); return; }
        setIsActive(true); setIsPaused(false); setTimeElapsed(0);
        sessionStartTimeRef.current = new Date();
    }, [taskName]);

    const handlePauseResumeSession = useCallback(() => setIsPaused(!isPaused), [isPaused]);

    const handleEndSession = useCallback(async () => {
        if (!authReady || !userId || !db) {
            setError("Cannot save session: Not connected.");
            setIsActive(false); setIsPaused(false); clearInterval(timerRef.current); return;
        }
        setIsActive(false); setIsPaused(false); clearInterval(timerRef.current);
        const sessionData = {
            taskName: taskName.trim() || "Untitled Session",
            startTime: Timestamp.fromDate(sessionStartTimeRef.current),
            endTime: serverTimestamp(),
            durationSeconds: timeElapsed, userId,
        };
        try {
            const sessionsCollectionPath = `artifacts/${appId}/users/${userId}/completedSessions`;
            await addDoc(collection(db, sessionsCollectionPath), sessionData);
            setTaskName(''); setTimeElapsed(0); setError(null);
        } catch (e) {
            console.error("Error adding document: ", e);
            setError("Failed to save session.");
        }
    }, [taskName, timeElapsed, userId, authReady]);

    const handleDeleteRequest = (sessionId) => {
        setSessionToDelete(sessionId); setShowDeleteConfirm(true); setError(null);
    };
    const cancelDeleteSession = () => { setShowDeleteConfirm(false); setSessionToDelete(null); };
    const confirmDeleteSession = async () => {
        if (!sessionToDelete || !authReady || !userId || !db) {
            setError("Cannot delete: Not connected or session not specified.");
            setShowDeleteConfirm(false); setSessionToDelete(null); return;
        }
        try {
            const sessionDocPath = `artifacts/${appId}/users/${userId}/completedSessions/${sessionToDelete}`;
            await deleteDoc(doc(db, sessionDocPath));
            setShowDeleteConfirm(false); setSessionToDelete(null); setError(null);
        } catch (e) {
            console.error("Error deleting document: ", e); setError("Failed to delete session.");
            setShowDeleteConfirm(false); setSessionToDelete(null);
        }
    };

    const handleEditSession = (sessionId, currentTaskName) => {
        setEditingSessionId(sessionId); setEditingTaskName(sessionId ? currentTaskName : ''); setError(null);
    };
    const handleSaveEdit = async (sessionId) => {
        if (!authReady || !userId || !db) { setError("Cannot update: Not connected."); return; }
        if (!editingTaskName.trim()) { setError("Task name cannot be empty."); return; }
        try {
            const sessionDocPath = `artifacts/${appId}/users/${userId}/completedSessions/${sessionId}`;
            await setDoc(doc(db, sessionDocPath), { taskName: editingTaskName.trim() }, { merge: true });
            setEditingSessionId(null); setEditingTaskName(''); setError(null);
        } catch (e) {
            console.error("Error updating document: ", e); setError("Failed to update session name.");
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

            {error && !geminiModalOpen && !showDeleteConfirm && ( 
                <div className="w-full max-w-md bg-red-500 text-white p-3 rounded-md mb-6 text-center shadow-lg flex items-center justify-center">
                    <AlertTriangle size={20} className="inline mr-2" /> {error}
                    <button onClick={() => setError(null)} className="ml-auto text-sm underline hover:text-red-200">Dismiss</button>
                </div>
            )}

            {/* Gemini Modal */}
            <Modal
                isOpen={geminiModalOpen}
                onClose={() => setGeminiModalOpen(false)}
                title={<><Sparkles size={22} className="mr-2 text-yellow-400" /> {geminiModalTitle}</>}
                primaryAction={() => setGeminiModalOpen(false)}
                primaryActionText="Close"
            >
                {isGenerating ? (
                    <div className="flex flex-col items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                        <p className="mt-3 text-slate-300">Generating insights...</p>
                    </div>
                ) : (
                    <div className="whitespace-pre-wrap">{geminiModalContent || "No content generated."}</div>
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteConfirm}
                onClose={cancelDeleteSession}
                title={<><AlertTriangle size={22} className="mr-2 text-red-500" /> Confirm Deletion</>}
                primaryAction={confirmDeleteSession}
                primaryActionText="Delete"
                primaryActionColor="bg-red-600 hover:bg-red-700"
                secondaryAction={cancelDeleteSession}
                secondaryActionText="Cancel"
            >
                <p>Are you sure you want to delete this session? This action cannot be undone.</p>
            </Modal>


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
                            <div className="flex flex-col sm:flex-row sm:space-x-3 space-y-3 sm:space-y-0">
                                <button
                                    onClick={handleStartSession}
                                    disabled={!authReady || !userId || !taskName.trim()}
                                    className="w-full flex items-center justify-center p-3 bg-green-500 hover:bg-green-600 disabled:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 shadow-md"
                                >
                                    <Play size={20} className="mr-2" /> Start Focus
                                </button>
                                {taskName.trim() && (
                                    <button
                                        onClick={handleGetFocusTips}
                                        disabled={isGenerating || !authReady || !userId}
                                        className="w-full flex items-center justify-center p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 shadow-md"
                                    >
                                        <Brain size={20} className="mr-2" /> ✨ Get Focus Tips
                                    </button>
                                )}
                            </div>
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
                                    onGetReflection={handleGetReflection}
                                />
                            ))}
                        </ul>
                    )}
                </section>
            </main>
            <footer className="mt-12 text-center text-slate-400 text-sm">
                <p>Track your productivity, one session at a time. Enhanced with ✨ AI!</p>
                <p>&copy; {new Date().getFullYear()} Focus Tracker App</p>
            </footer>
        </div>
    );
};

export default App;
