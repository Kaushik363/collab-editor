import React, { useEffect, useRef, useState } from 'react';
import Client from './Client';
import Editor,{LANGUAGES} from './Editor';
import { initSocket } from '../socket';
import { useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';

function EditorPagee() {
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const chatEndRef = useRef(null);
  const location = useLocation();
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  const [language, setLanguage] = useState('javascript');
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput]   = useState('');
  const [showChat, setShowChat]=useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();

      socketRef.current._username=location.state?.username;

      const handleError = (err) => {
        console.log('socket error', err);
        toast.error('Socket connection failed, try again later');
        navigate('/');
      };

      socketRef.current.on('connect_error', (err) => handleError(err));
      socketRef.current.on('connect_failed', (err) => handleError(err));

      socketRef.current.emit('join', {
        roomId,
        username: location.state?.username,
      });

      socketRef.current.on('joined', ({ clients, username, socketId }) => {
        //Only show toast for OTHER users joining, not yourself
        if (username !== location.state?.username) {
          toast.success(`${username} joined the room`);
        }

        // Always update client list
        setClients(clients);

        if(socketId!==socketRef.current.id){
          if(codeRef.current!=null){
            socketRef.current.emit('sync-code',{
              socketId,
              code: codeRef.current,
            });
          }

          socketRef.current.emit('sync-language',{
            socketId,
            language,
          });
        }
      });

      // Listen for disconnections
      socketRef.current.on('disconnected', ({ socketId, username }) => {
        toast.success(`${username} left the room`);
        setClients((prev) => prev.filter((client) => client.socketId !== socketId));
      });

      socketRef.current.on('chat-message',(msg)=>{
        setMessages(prev=>[...prev,msg]);
        //If chat is closed, increment unread count
        setShowChat(prev=>{
          if(!prev) setUnread(u=>u+1);
          return prev;
        });
      });

      socketRef.current.on('language-change',({language})=>{
        setLanguage(language);
      });

    };

    init();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current?.off('joined');
      socketRef.current?.off('disconnected');
      socketRef.current?.off('chat-message');
      socketRef.current?.off('language-change');
    };
  }, []);


  useEffect(()=>{
    chatEndRef.current?.scrollIntoView({behaviour: 'smooth'});
  },[messages]);

    const handleLanguageChange=(e)=>{
      const newLang=e.target.value;
      setLanguage(newLang);
      socketRef.current.emit('language-change',{roomId,language: newLang});
    };


    const sendMessage=(e)=>{
      if(!chatInput.trim()) return;
      socketRef.current.emit('chat-message',{
        roomId,
        message: chatInput.trim(),
        username: location.state?.username,
      });
      setChatInput('');
    };

    const handleChatKeyDown=(e)=>{
      if(e.key==='Enter' && !e.shiftKey){
        e.preventDefault();
        sendMessage();
      }
    };

    const toggleChat=()=>{
      setShowChat(prev=>!prev);
      setUnread(0);
    }

  // Copy Room ID to clipboard
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success('Room ID copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy Room ID');
    }
  };

  // Leave room and navigate back to home
  const leaveRoom = () => {
    navigate('/');
  };

  if (!location.state) {
    return <Navigate to="/" />;
  }

  return (
        <div className="container-fluid vh-100" style={{ overflow: 'hidden' }}>
            <div className="row h-100" style={{ flexWrap: 'nowrap' }}>
 
                {/* ── Sidebar ───────────────────────────────────────────── */}
                <div
                    className="col-auto bg-dark text-light d-flex flex-column h-100"
                    style={{ width: '200px', boxShadow: '2px 0 8px rgba(0,0,0,0.3)', zIndex: 10 }}
                >
                    <img
                        src="/images/codecollab-logo.png"
                        alt="CodeCollab logo"
                        className="img-fluid mx-auto d-block"
                        style={{ maxWidth: '130px', marginTop: '28px' }}
                    />
                    <hr />
 
                    {/* Connected users */}
                    <div className="d-flex flex-column overflow-auto flex-grow-1">
                        <small className="text-muted px-2 mb-1" style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
                            CONNECTED — {clients.length}
                        </small>
                        {clients.map((client) => (
                            <Client key={client.socketId} username={client.username} />
                        ))}
                    </div>
 
                    {/* Action buttons */}
                    <div className="p-3">
                        <hr />
                        <button className="btn btn-success w-100 mb-2" style={{ fontSize: '13px' }} onClick={copyRoomId}>
                            Copy Room ID
                        </button>
 
                        {/* FEATURE 2: Chat toggle button with unread badge */}
                        <div className="position-relative mb-2">
                            <button
                                className={`btn w-100 ${showChat ? 'btn-info' : 'btn-outline-info'}`}
                                style={{ fontSize: '13px' }}
                                onClick={toggleChat}
                            >
                                💬 Chat
                            </button>
                            {unread > 0 && (
                                <span
                                    className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                                    style={{ fontSize: '10px' }}
                                >
                                    {unread}
                                </span>
                            )}
                        </div>
 
                        <button className="btn btn-danger w-100" style={{ fontSize: '13px' }} onClick={leaveRoom}>
                            Leave Room
                        </button>
                    </div>
                </div>
 
                {/* ── Editor + Chat Area ────────────────────────────────── */}
                <div className="col d-flex flex-column h-100" style={{ minWidth: 0 }}>
 
                    {/* FEATURE 1: Language selector toolbar */}
                    <div
                        className="d-flex align-items-center px-3 py-2 bg-dark"
                        style={{ borderBottom: '1px solid #3a3a3a', gap: '12px' }}
                    >
                        <label htmlFor="lang-select" className="text-muted mb-0" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                            Language:
                        </label>
                        <select
                            id="lang-select"
                            className="form-select form-select-sm bg-dark text-light border-secondary"
                            style={{ maxWidth: '160px', fontSize: '13px' }}
                            value={language}
                            onChange={handleLanguageChange}
                        >
                            {LANGUAGES.map(lang => (
                                <option key={lang.value} value={lang.value}>
                                    {lang.label}
                                </option>
                            ))}
                        </select>
                        <span className="text-muted ms-auto" style={{ fontSize: '11px' }}>
                            Room: <code style={{ color: '#61afef' }}>{roomId}</code>
                        </span>
                    </div>
 
                    {/* Editor + Chat side by side */}
                    <div className="d-flex flex-row flex-grow-1" style={{ minHeight: 0 }}>
 
                        {/* Editor */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Editor
                                socketRef={socketRef}
                                roomId={roomId}
                                onCodeChange={(code) => (codeRef.current = code)}
                                language={language}
                                onLanguageChange={(lang) => setLanguage(lang)}
                            />
                        </div>
 
                        {/* FEATURE 2: Chat panel (slides in from right) */}
                        {showChat && (
                            <div
                                className="d-flex flex-column bg-dark text-light"
                                style={{
                                    width: '280px',
                                    borderLeft: '1px solid #3a3a3a',
                                    flexShrink: 0,
                                }}
                            >
                                {/* Chat header */}
                                <div
                                    className="d-flex align-items-center justify-content-between px-3 py-2"
                                    style={{ borderBottom: '1px solid #3a3a3a', fontSize: '13px', fontWeight: 500 }}
                                >
                                    <span>Room Chat</span>
                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        style={{ padding: '1px 7px', fontSize: '12px' }}
                                        onClick={toggleChat}
                                    >
                                        ✕
                                    </button>
                                </div>
 
                                {/* Messages */}
                                <div
                                    className="flex-grow-1 overflow-auto px-3 py-2"
                                    style={{ fontSize: '13px', lineHeight: '1.5' }}
                                >
                                    {messages.length === 0 && (
                                        <p className="text-muted text-center mt-3" style={{ fontSize: '12px' }}>
                                            No messages yet. Say hi!
                                        </p>
                                    )}
                                    {messages.map((msg, i) => {
                                        const isMe = msg.socketId === socketRef.current?.id;
                                        return (
                                            <div
                                                key={i}
                                                className="mb-2"
                                                style={{ textAlign: isMe ? 'right' : 'left' }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: '10px',
                                                        color: '#888',
                                                        marginBottom: '2px',
                                                    }}
                                                >
                                                    {isMe ? 'You' : msg.username} · {msg.timestamp}
                                                </div>
                                                <span
                                                    style={{
                                                        display: 'inline-block',
                                                        background: isMe ? '#264f78' : '#2a2a3a',
                                                        color: '#e0e0e0',
                                                        borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                                        padding: '5px 10px',
                                                        maxWidth: '200px',
                                                        wordBreak: 'break-word',
                                                        fontSize: '12px',
                                                    }}
                                                >
                                                    {msg.message}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    <div ref={chatEndRef} />
                                </div>
 
                                {/* Input */}
                                <div
                                    className="d-flex px-2 py-2"
                                    style={{ borderTop: '1px solid #3a3a3a', gap: '6px' }}
                                >
                                    <input
                                        type="text"
                                        className="form-control form-control-sm bg-dark text-light border-secondary"
                                        placeholder="Type a message..."
                                        style={{ fontSize: '12px' }}
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={handleChatKeyDown}
                                        maxLength={500}
                                    />
                                    <button
                                        className="btn btn-sm btn-primary"
                                        style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
                                        onClick={sendMessage}
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EditorPagee;