/**
 * ConnectX Interactive Engine - High Fidelity Web App Platform
 * Real-Time Collaboration & Communication SPA Orchestration
 */

class ConnectXApp {
  constructor() {
    this.currentView = 'landing'; // 'landing' or 'dashboard'
    this.activeTab = 'overview'; // dashboard sub-tabs
    this.activeChannel = 'general';
    this.activeShowcaseTab = 'video';
    this.billingCycle = 'monthly'; // 'monthly' or 'annual'
    
    this.username = 'Alex Rivera';

    // Socket setup
    this.socket = null;
    this.isSocketConnected = false;
    this.remotePeers = {}; // maps peer socketId to { id, name, avatar, color, pc }

    if (typeof io !== 'undefined') {
      this.socket = io();
      this.isSocketConnected = true;
    } else {
      console.warn("Socket.io client not found. Running in offline/simulator mode.");
    }

    // Friends list
    this.friends = [
      { name: "Sarah Chen", role: "Lead Product Manager", avatar: "SC", color: "avatar-cyan" },
      { name: "Marcus K.", role: "Director of UX", avatar: "MK", color: "avatar-magenta" },
      { name: "David R.", role: "Chief Information Officer", avatar: "DR", color: "avatar-blue" }
    ];

    // Whiteboard Canvas State
    this.canvas = null;
    this.ctx = null;
    this.isDrawing = false;
    this.brushColor = 'var(--cyan)';
    this.brushSize = 4;
    this.drawingTool = 'draw'; // 'draw' or 'erase'
    this.lastX = 0;
    this.lastY = 0;

    // Chat Simulator Peer Responses
    this.mockPeerReplies = {
      general: [
        { sender: "Sarah Chen", msg: "I checked the bandwidth latency logs, Alex. Everything looks incredibly smooth!" },
        { sender: "Marcus K.", msg: "Adding some new design sketches to the whiteboard canvas right now." },
        { sender: "Sarah Chen", msg: "Perfect, let's wrap this up before the client operations review sync." }
      ],
      engineering: [
        { sender: "David R.", msg: "SecOps verified the dynamic key exchanges. SOC2 audits are green." },
        { sender: "Marcus K.", msg: "Is the WebRTC ICE reconnect loop working on Android browsers?" },
        { sender: "David R.", msg: "Yes, STUN/TURN fallback list is fully operational." }
      ],
      marketing: [
        { sender: "Sarah Chen", msg: "The Landing Page layout looks spectacular. Very premium Dribbble feel." },
        { sender: "Marcus K.", msg: "I used Outfit and Plus Jakarta Sans fonts. Clean, sleek, Linear-inspired feel." }
      ]
    };
    this.replyIndex = { general: 0, engineering: 0, marketing: 0 };

    // Diagnostics / Media
    this.localStream = null;
    this.micInterval = null;
    this.meetingTimerInterval = null;
    this.meetingDuration = 0;

    // Chart.js instance
    this.bandwidthChart = null;

    // Initialize on page load
    window.addEventListener('DOMContentLoaded', () => this.init());
  }

  init() {
    this.initParticles();
    this.initLucide();
    this.initScrollHeader();
    this.initShowcaseTabs();
    this.initWhiteboardCanvas();
    this.initFileUploader();
    this.initThemeAccent();

    if (this.isSocketConnected) {
      this.initSocketEvents();
    }
  }

  // ==========================================
  // SOCKET.IO EVENT ROUTERS
  // ==========================================
  initSocketEvents() {
    this.socket.on('connect', () => {
      this.socket.emit('user-register', {
        username: this.username,
        role: 'Workspace Administrator'
      });
    });

    this.socket.on('roster-update', (users) => {
      this.handleRosterUpdate(users);
    });

    this.socket.on('chat-msg', (data) => {
      this.handleIncomingChatMessage(data);
    });

    this.socket.on('chat-history', (data) => {
      this.handleIncomingChatHistory(data);
    });

    this.socket.on('whiteboard-draw', (data) => {
      this.handleIncomingWhiteboardDraw(data);
    });

    this.socket.on('whiteboard-clear', () => {
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    });

    this.socket.on('init-files', (files) => {
      const tableBody = document.getElementById('shared-files-table-body');
      if (tableBody) {
        tableBody.innerHTML = '';
        files.forEach(f => this.addFileRowToUI(f));
      }
    });

    this.socket.on('file-shared', (fileInfo) => {
      this.addFileRowToUI(fileInfo);
    });

    this.socket.on('peer-joined', async (peer) => {
      this.createToast(`${peer.name} joined the meeting room.`, "toast-cyan");
      this.handlePeerJoinedMeeting(peer);
    });

    this.socket.on('webrtc-offer', async (data) => {
      this.handleWebRTCOffer(data.sender, data.offer);
    });

    this.socket.on('webrtc-answer', async (data) => {
      this.handleWebRTCAnswer(data.sender, data.answer);
    });

    this.socket.on('webrtc-ice-candidate', (data) => {
      this.handleWebRTCIceCandidate(data.sender, data.candidate);
    });

    this.socket.on('peer-left', (peerId) => {
      this.handlePeerLeftMeeting(peerId);
    });
  }

  handleRosterUpdate(users) {
    const rosterList = document.getElementById('friends-roster-list');
    if (!rosterList) return;
    rosterList.innerHTML = '';
    
    const otherUsers = users.filter(u => u.id !== this.socket.id);
    const defaultMockFriends = [
      { name: "Sarah Chen", role: "Lead Product Manager", avatar: "SC", color: "avatar-cyan" },
      { name: "Marcus K.", role: "Director of UX", avatar: "MK", color: "avatar-magenta" },
      { name: "David R.", role: "Chief Information Officer", avatar: "DR", color: "avatar-blue" }
    ];

    defaultMockFriends.forEach(df => {
      const isOnline = otherUsers.some(ou => ou.name === df.name);
      if (!isOnline) {
        const card = document.createElement('div');
        card.className = 'friend-card offline';
        card.style.opacity = '0.6';
        card.innerHTML = `
          <div class="t-avatar ${df.color}">${df.avatar}</div>
          <div class="friend-details">
            <span class="fr-name">${df.name}</span>
            <span class="fr-role">${df.role}</span>
          </div>
          <span class="friend-status offline"><span class="status-pulse-red" style="background:#e11d48;"></span> Offline</span>
          <button class="hi-action-btn" disabled title="Offline"><i data-lucide="phone"></i></button>
        `;
        rosterList.appendChild(card);
      }
    });

    otherUsers.forEach(u => {
      const card = document.createElement('div');
      card.className = 'friend-card';
      card.innerHTML = `
        <div class="t-avatar ${u.color}">${u.avatar}</div>
        <div class="friend-details">
          <span class="fr-name">${u.name}</span>
          <span class="fr-role">${u.role}</span>
        </div>
        <span class="friend-status online"><span class="status-pulse-green"></span> Online</span>
        <button class="hi-action-btn" onclick="app.inviteFriendToMeeting('${u.name}')" title="Invite to active huddle"><i data-lucide="phone-call"></i></button>
      `;
      rosterList.appendChild(card);
    });

    const badge = document.getElementById('friends-count-badge');
    if (badge) {
      badge.textContent = `${otherUsers.length + 3} Contacts Directory`;
    }

    this.initLucide();
  }

  handleIncomingChatMessage(data) {
    if (data.channel === 'meeting-room') {
      const chatBox = document.getElementById('meeting-quick-chat-box');
      if (chatBox) {
        const bubble = document.createElement('div');
        bubble.className = 'mq-bubble';
        bubble.innerHTML = `
          <span class="mq-sender">${data.sender}:</span>
          <p class="mq-text">${data.msg}</p>
        `;
        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;
      }
      this.synthesizeNotificationSound();
      return;
    }

    if (data.channel !== this.activeChannel) {
      this.createToast(`New message in #${data.channel} from ${data.sender}`, "toast-purple");
      return;
    }

    const stream = document.getElementById('chat-messages-stream');
    if (!stream) return;

    const row = document.createElement('div');
    row.className = 'chat-msg-row';
    row.innerHTML = `
      <div class="t-avatar ${data.color} avatar-sm">${data.avatar}</div>
      <div class="chat-msg-details">
        <span class="cm-sender">${data.sender} <span class="cm-time">${data.time}</span></span>
        <p class="cm-body">${data.msg}</p>
      </div>
    `;
    stream.appendChild(row);
    stream.scrollTop = stream.scrollHeight;
    this.synthesizeNotificationSound();
  }

  handleIncomingChatHistory(data) {
    if (data.channel !== this.activeChannel) return;
    const stream = document.getElementById('chat-messages-stream');
    if (!stream) return;
    stream.innerHTML = '';

    data.messages.forEach(msg => {
      const row = document.createElement('div');
      row.className = 'chat-msg-row';
      row.innerHTML = `
        <div class="t-avatar ${msg.color} avatar-sm">${msg.avatar}</div>
        <div class="chat-msg-details">
          <span class="cm-sender">${msg.sender} <span class="cm-time">${msg.time}</span></span>
          <p class="cm-body">${msg.msg}</p>
        </div>
      `;
      stream.appendChild(row);
    });
    stream.scrollTop = stream.scrollHeight;
  }

  handleIncomingWhiteboardDraw(data) {
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.moveTo(data.x0, data.y0);
    this.ctx.lineTo(data.x1, data.y1);
    this.ctx.strokeStyle = data.color;
    this.ctx.lineWidth = data.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
  }

  addFileRowToUI(f) {
    const tableBody = document.getElementById('shared-files-table-body');
    if (!tableBody) return;

    if (document.getElementById(`file-row-${f.filename}`)) return;

    const sizeStr = f.size > 1024 * 1024 
      ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` 
      : `${(f.size / 1024).toFixed(0)} KB`;

    const row = document.createElement('tr');
    row.id = `file-row-${f.filename}`;
    
    const downloadAction = f.url 
      ? `window.open('${f.url}', '_blank')` 
      : `app.downloadMockFile('${f.name}')`;

    row.innerHTML = `
      <td>
        <div class="file-name-cell">
          <i data-lucide="file" class="text-cyan"></i>
          <span>${f.name}</span>
        </div>
      </td>
      <td>${sizeStr}</td>
      <td>${f.uploader}</td>
      <td><span class="badge-active-green"><i data-lucide="lock" style="width:10px;height:10px;"></i> Secured</span></td>
      <td><button class="hi-action-btn" onclick="${downloadAction}"><i data-lucide="download"></i></button></td>
    `;
    tableBody.appendChild(row);

    const rowsCount = tableBody.querySelectorAll('tr').length;
    const badge = document.getElementById('files-count-badge');
    if (badge) badge.textContent = `${rowsCount} Files Shared`;

    this.initLucide();
  }

  restoreUploaderUI() {
    const uploaderZone = document.getElementById('file-drop-zone');
    if (!uploaderZone) return;
    
    uploaderZone.innerHTML = `
      <i data-lucide="upload-cloud" class="upload-icon text-cyan"></i>
      <h3>Secure Upload Vault</h3>
      <p>Drag and drop any files here or click below to secure them. Files are scanned, encrypted with AES-256 protocols, and stored instantly.</p>
      <input type="file" id="file-uploader-input" style="display:none;" onchange="app.handleFileSelect(event)">
      <button class="btn btn-primary" onclick="document.getElementById('file-uploader-input').click()">
        Select Files to Secure
      </button>
      <span class="vault-sec-tag"><i data-lucide="shield-check" class="text-cyan"></i> AES-256 Cloud Shield Engaged</span>
    `;
    this.initLucide();
    this.initFileUploader();
  }

  // ==========================================
  // WEBRTC MEETING ORCHESTRATION
  // ==========================================
  async joinMeetingRoom() {
    if (!this.isSocketConnected) return;

    const videoGrid = document.getElementById('meeting-video-grid');
    if (videoGrid) {
      const localCard = document.getElementById('local-video-card');
      videoGrid.innerHTML = '';
      if (localCard) {
        videoGrid.appendChild(localCard);
      }
    }

    this.updateMeetingParticipantsUI();
    this.socket.emit('webrtc-join');
  }

  leaveMeetingRoom() {
    if (!this.isSocketConnected) return;
    this.socket.emit('webrtc-leave');

    Object.keys(this.remotePeers).forEach(peerId => {
      if (this.remotePeers[peerId].pc) {
        this.remotePeers[peerId].pc.close();
      }
      const peerCard = document.getElementById(`peer-card-${peerId}`);
      if (peerCard) peerCard.remove();
    });
    this.remotePeers = {};

    this.updateMeetingParticipantsUI();
  }

  createPeerConnection(peerId, isInitiator) {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    const pc = new RTCPeerConnection(configuration);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit('webrtc-ice-candidate', { target: peerId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      console.log('Received remote track', e.streams[0]);
      this.addRemoteVideoStream(peerId, e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.handlePeerLeftMeeting(peerId);
      }
    };

    return pc;
  }

  addRemoteVideoStream(peerId, stream) {
    const videoGrid = document.getElementById('meeting-video-grid');
    if (!videoGrid) return;

    let card = document.getElementById(`peer-card-${peerId}`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'meeting-video-card';
      card.id = `peer-card-${peerId}`;

      const peer = this.remotePeers[peerId] || { name: 'Remote Colleague', avatar: 'RC', color: 'avatar-cyan' };

      card.innerHTML = `
        <div class="video-feed-container">
          <video id="video-${peerId}" autoplay playsinline style="width:100%; height:100%; object-fit:cover; display:none;"></video>
          <div class="fallback-cam-feed" id="fallback-${peerId}">
            <div class="t-avatar ${peer.color} avatar-lg">${peer.avatar}</div>
            <div class="live-mic-visualizer" id="mic-vis-${peerId}">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <span class="fallback-status-txt">Connecting Stream...</span>
          </div>
        </div>
        <div class="video-overlay-info">
          <span class="participant-name">${peer.name}</span>
          <span class="participant-tag-mic" id="mic-tag-${peerId}"><i data-lucide="mic"></i></span>
        </div>
      `;
      videoGrid.appendChild(card);
      this.initLucide();
    }

    const videoEl = document.getElementById(`video-${peerId}`);
    const fallbackEl = document.getElementById(`fallback-${peerId}`);
    if (videoEl && stream) {
      videoEl.srcObject = stream;
      videoEl.style.display = 'block';
      if (fallbackEl) fallbackEl.style.display = 'none';
    }
  }

  async handlePeerJoinedMeeting(peer) {
    if (this.remotePeers[peer.id]) {
      if (this.remotePeers[peer.id].pc) {
        this.remotePeers[peer.id].pc.close();
      }
    }

    const pc = this.createPeerConnection(peer.id, true);
    this.remotePeers[peer.id] = {
      id: peer.id,
      name: peer.name,
      avatar: peer.avatar,
      color: peer.color,
      pc
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc-offer', { target: peer.id, offer });
    } catch (err) {
      console.error('Failed to create offer for peer', peer.id, err);
    }

    this.updateMeetingParticipantsUI();
  }

  async handleWebRTCOffer(senderId, offer) {
    if (this.remotePeers[senderId]) {
      if (this.remotePeers[senderId].pc) {
        this.remotePeers[senderId].pc.close();
      }
    }

    const friendsObj = this.friends.find(f => f.id === senderId);
    const peerName = friendsObj ? friendsObj.name : 'Remote Peer';
    const peerAvatar = friendsObj ? friendsObj.avatar : 'PE';
    const peerColor = friendsObj ? friendsObj.color : 'avatar-blue';

    const pc = this.createPeerConnection(senderId, false);
    this.remotePeers[senderId] = {
      id: senderId,
      name: peerName,
      avatar: peerAvatar,
      color: peerColor,
      pc
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('webrtc-answer', { target: senderId, answer });
    } catch (err) {
      console.error('Failed to handle offer from peer', senderId, err);
    }

    this.updateMeetingParticipantsUI();
  }

  async handleWebRTCAnswer(senderId, answer) {
    const peerObj = this.remotePeers[senderId];
    if (peerObj && peerObj.pc) {
      try {
        await peerObj.pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Failed to set remote description for peer', senderId, err);
      }
    }
  }

  async handleWebRTCIceCandidate(senderId, candidate) {
    const peerObj = this.remotePeers[senderId];
    if (peerObj && peerObj.pc) {
      try {
        await peerObj.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Failed to add ICE candidate for peer', senderId, err);
      }
    }
  }

  handlePeerLeftMeeting(peerId) {
    const peerObj = this.remotePeers[peerId];
    if (peerObj) {
      if (peerObj.pc) {
        peerObj.pc.close();
      }
      delete this.remotePeers[peerId];
    }

    const peerCard = document.getElementById(`peer-card-${peerId}`);
    if (peerCard) {
      peerCard.remove();
    }

    this.updateMeetingParticipantsUI();
  }

  updateMeetingParticipantsUI() {
    const ulist = document.querySelector('.msp-user-list');
    if (!ulist) return;
    ulist.innerHTML = '';

    const localInitials = this.username.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const localItem = document.createElement('div');
    localItem.className = 'msp-user-item';
    
    const isMicActive = document.getElementById('btn-toggle-mic')?.classList.contains('active') || false;
    const isVideoActive = document.getElementById('btn-toggle-video')?.classList.contains('active') || false;
    
    localItem.innerHTML = `
      <div class="t-avatar avatar-purple avatar-sm">${localInitials}</div>
      <span class="msp-uname">${this.username} (You)</span>
      <div class="msp-user-controls">
        <i data-lucide="${isMicActive ? 'mic' : 'mic-off'}" class="${isMicActive ? 'text-cyan' : 'text-red'}"></i>
        <i data-lucide="${isVideoActive ? 'video' : 'video-off'}" class="${isVideoActive ? 'text-cyan' : 'text-red'}"></i>
      </div>
    `;
    ulist.appendChild(localItem);

    Object.values(this.remotePeers).forEach(peer => {
      const item = document.createElement('div');
      item.className = 'msp-user-item';
      item.innerHTML = `
        <div class="t-avatar ${peer.color} avatar-sm">${peer.avatar}</div>
        <span class="msp-uname">${peer.name}</span>
        <div class="msp-user-controls">
          <i data-lucide="mic" class="text-cyan"></i>
          <i data-lucide="video" class="text-cyan"></i>
        </div>
      `;
      ulist.appendChild(item);
    });

    const tabBtn = document.getElementById('msp-tab-users');
    if (tabBtn) {
      const currentCount = Object.keys(this.remotePeers).length + 1;
      tabBtn.textContent = `Participants (${currentCount})`;
    }

    this.initLucide();
  }


  // ==========================================
  // AUTHENTICATION MODAL ENGINE
  // ==========================================
  showAuthModal(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.add('active');
      this.switchAuthTab(tab);
      this.synthesizeNotificationSound();
    }
  }

  hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  switchAuthTab(tab) {
    const tabLoginBtn = document.getElementById('auth-tab-login');
    const tabSignupBtn = document.getElementById('auth-tab-signup');
    const formLogin = document.getElementById('auth-form-login');
    const formSignup = document.getElementById('auth-form-signup');
    
    if (tab === 'login') {
      if (tabLoginBtn) tabLoginBtn.classList.add('active');
      if (tabSignupBtn) tabSignupBtn.classList.remove('active');
      if (formLogin) formLogin.style.display = 'block';
      if (formSignup) formSignup.style.display = 'none';
    } else {
      if (tabLoginBtn) tabLoginBtn.classList.remove('active');
      if (tabSignupBtn) tabSignupBtn.classList.add('active');
      if (formLogin) formLogin.style.display = 'none';
      if (formSignup) formSignup.style.display = 'block';
    }
    this.synthesizeNotificationSound();
  }

  handleAuthSubmit(type) {
    let name = 'Alex Rivera';
    if (type === 'login') {
      const emailInput = document.getElementById('login-email');
      const email = emailInput ? emailInput.value.trim() : 'alex@connectx.com';
      name = email.split('@')[0];
      name = name.charAt(0).toUpperCase() + name.slice(1);
    } else {
      const nameInput = document.getElementById('signup-name');
      name = nameInput ? nameInput.value.trim() : 'Alex Rivera';
    }
    
    this.updateUserProfile(name);
    this.hideAuthModal();
    this.showDashboard();
  }

  updateUserProfile(name) {
    if (!name) return;
    this.username = name;
    
    const setUsernameInput = document.getElementById('set-username');
    if (setUsernameInput) setUsernameInput.value = name;
    
    const profileNameEl = document.getElementById('profile-name-display');
    if (profileNameEl) profileNameEl.textContent = name;
    
    const greetNameEl = document.getElementById('greeting-username');
    if (greetNameEl) greetNameEl.textContent = name;
    
    // Update avatar characters
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatars = [document.getElementById('avatar-display'), document.getElementById('local-avatar-tag')];
    avatars.forEach(av => {
      if (av) av.textContent = initials;
    });
  }

  // ==========================================
  // FRIENDS DIRECTORY ENGINE
  // ==========================================
  addFriend() {
    const nameEl = document.getElementById('friend-input-name');
    const roleEl = document.getElementById('friend-input-role');
    if (!nameEl || !roleEl) return;
    
    const name = nameEl.value.trim();
    const role = roleEl.value.trim();
    
    if (!name || !role) return;

    // Create unique initials and color avatar
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const colors = ["avatar-cyan", "avatar-magenta", "avatar-blue", "avatar-purple"];
    const chosenColor = colors[this.friends.length % colors.length];

    const newFriend = { name, role, avatar: initials, color: chosenColor };
    this.friends.push(newFriend);

    // Append to Roster List
    const rosterList = document.getElementById('friends-roster-list');
    if (rosterList) {
      const card = document.createElement('div');
      card.className = 'friend-card';
      card.innerHTML = `
        <div class="t-avatar ${chosenColor}">${initials}</div>
        <div class="friend-details">
          <span class="fr-name">${name}</span>
          <span class="fr-role">${role}</span>
        </div>
        <span class="friend-status online"><span class="status-pulse-green"></span> Online</span>
        <button class="hi-action-btn" onclick="app.inviteFriendToMeeting('${name}')" title="Invite to active huddle"><i data-lucide="phone-call"></i></button>
      `;
      rosterList.appendChild(card);
    }

    // Update count badge
    const badge = document.getElementById('friends-count-badge');
    if (badge) badge.textContent = `${this.friends.length} Contacts Online`;

    // Reset inputs
    nameEl.value = '';
    roleEl.value = '';
    
    this.initLucide();
    this.synthesizeNotificationSound();
    this.createToast(`Connection invitation sent and accepted by ${name}!`, "toast-purple");
  }

  inviteFriendToMeeting(name) {
    this.createToast(`Sending secure session invitation to ${name}...`, "toast-cyan");
    this.synthesizeNotificationSound();
    
    setTimeout(() => {
      this.createToast(`${name} has joined the active huddle room.`, "toast-purple");
      this.synthesizeNotificationSound();
      
      const ulist = document.querySelector('.msp-user-list');
      if (ulist) {
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const colors = ["avatar-cyan", "avatar-magenta", "avatar-blue", "avatar-purple"];
        const chosenColor = colors[Math.floor(Math.random() * colors.length)];
        
        const item = document.createElement('div');
        item.className = 'msp-user-item';
        item.innerHTML = `
          <div class="t-avatar ${chosenColor} avatar-sm">${initials}</div>
          <span class="msp-uname">${name}</span>
          <div class="msp-user-controls"><i data-lucide="mic"></i><i data-lucide="video"></i></div>
        `;
        ulist.appendChild(item);
        this.initLucide();
        
        const tabBtn = document.getElementById('msp-tab-users');
        if (tabBtn) {
          const currentCount = ulist.querySelectorAll('.msp-user-item').length;
          tabBtn.textContent = `Participants (${currentCount})`;
        }
      }
    }, 2000);
  }

  // ==========================================
  // INVITATION CLIPBOARD COPY
  // ==========================================
  copyMeetingInviteLink() {
    const inviteUrl = 'https://connectx.app/meet-dx49-z73q';
    navigator.clipboard.writeText(inviteUrl).then(() => {
      this.createToast("Meeting invite link copied to clipboard!", "toast-cyan");
      this.synthesizeNotificationSound();
    }).catch(err => {
      console.warn("Failed to write clipboard: ", err);
      this.createToast("Invite link: https://connectx.app/meet-dx49-z73q", "toast-purple");
    });
  }

  // 1. Ambient Background Floating Particles
  initParticles() {
    const container = document.getElementById('particle-container');
    if (!container) return;
    const numParticles = 25;
    for (let i = 0; i < numParticles; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = Math.random() * 8 + 4;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}vw`;
      p.style.bottom = `${Math.random() * 100}vh`;
      p.style.animationDuration = `${Math.random() * 10 + 10}s`;
      p.style.animationDelay = `${Math.random() * 5}s`;
      container.appendChild(p);
    }
  }

  // 2. Lucide Icons Refresher
  initLucide() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // 3. Transparent Navbar Scroll Elevation
  initScrollHeader() {
    const header = document.querySelector('.main-header');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });

    // Mobile Navigation Drawer Toggle Handler
    const mobileToggle = document.getElementById('mobile-menu-toggle');
    if (mobileToggle) {
      mobileToggle.addEventListener('click', () => this.toggleMobileMenu());
    }
  }

  toggleMobileMenu() {
    const menu = document.getElementById('mobile-nav');
    menu.classList.toggle('active');
    const toggleIcon = document.querySelector('#mobile-menu-toggle i');
    if (toggleIcon) {
      const isActive = menu.classList.contains('active');
      toggleIcon.setAttribute('data-lucide', isActive ? 'x' : 'menu');
      this.initLucide();
    }
  }

  // 4. Landing Page Showcase Switching Layout Slides
  initShowcaseTabs() {
    const buttons = document.querySelectorAll('.showcase-tab-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabName = btn.getAttribute('data-showcase-tab');
        this.switchShowcaseSlide(tabName);
      });
    });
  }

  switchShowcaseSlide(tabName) {
    const slides = document.querySelectorAll('.showcase-slide');
    slides.forEach(s => s.classList.remove('active'));
    
    const target = document.getElementById(`slide-${tabName}`);
    if (target) {
      target.classList.add('active');
    }
  }

  // 5. Billing Toggle and Pricing updates
  toggleBillingCycle() {
    const toggleDot = document.getElementById('pricing-toggle-dot');
    const monthlyLbl = document.getElementById('monthly-label');
    const annualLbl = document.getElementById('annual-label');

    if (this.billingCycle === 'monthly') {
      this.billingCycle = 'annual';
      toggleDot.classList.add('yearly');
      monthlyLbl.classList.remove('active');
      annualLbl.classList.add('active');
      this.updatePricingPrices(true);
      this.createToast("Applied Annual Discount: 20% savings loaded!", "toast-purple");
    } else {
      this.billingCycle = 'monthly';
      toggleDot.classList.remove('yearly');
      monthlyLbl.classList.add('active');
      annualLbl.classList.remove('active');
      this.updatePricingPrices(false);
    }
  }

  updatePricingPrices(isAnnual) {
    const starterPrice = document.getElementById('price-starter');
    const proPrice = document.getElementById('price-pro');
    const enterprisePrice = document.getElementById('price-enterprise');

    if (isAnnual) {
      this.animatePriceTransition(starterPrice, 0);
      this.animatePriceTransition(proPrice, 15);
      this.animatePriceTransition(enterprisePrice, 39);
    } else {
      this.animatePriceTransition(starterPrice, 0);
      this.animatePriceTransition(proPrice, 19);
      this.animatePriceTransition(enterprisePrice, 49);
    }
  }

  animatePriceTransition(element, targetVal) {
    let currentVal = parseInt(element.textContent);
    const steps = 10;
    const increment = (targetVal - currentVal) / steps;
    let stepCount = 0;
    const interval = setInterval(() => {
      currentVal += increment;
      element.textContent = Math.round(currentVal);
      stepCount++;
      if (stepCount >= steps) {
        clearInterval(interval);
        element.textContent = targetVal;
      }
    }, 30);
  }

  // 6. Security Tunnel Interactive Logic
  toggleSecurityShield() {
    const lockIcon = document.getElementById('lock-icon-svg');
    const shieldContainer = document.getElementById('shield-lock-btn');
    const statusTag = document.getElementById('sec-tunnel-status');
    const logBox = document.getElementById('security-log-container');

    const isLocked = shieldContainer.classList.contains('unlocked');

    if (isLocked) {
      // Locking again
      shieldContainer.classList.remove('unlocked');
      statusTag.textContent = "ENCRYPTED";
      statusTag.classList.remove('unlocked');
      lockIcon.setAttribute('data-lucide', 'lock');
      this.initLucide();
      this.createToast("Security tunnel encrypted successfully.", "toast-cyan");

      logBox.innerHTML = `
        <span class="log-line text-cyan">> Initiating Diffie-Hellman dynamic key exchange...</span>
        <span class="log-line text-purple">> Ephemeral shared session established successfully.</span>
        <span class="log-line text-magenta">> AES-GCM 256-bit encryption pipelines verified.</span>
      `;
    } else {
      // Unlocking
      shieldContainer.classList.add('unlocked');
      statusTag.textContent = "BYPASSED";
      statusTag.classList.add('unlocked');
      lockIcon.setAttribute('data-lucide', 'lock-open');
      this.initLucide();
      this.createToast("Alert: Security tunnel encryption bypassed manually!", "toast-magenta");

      logBox.innerHTML = `
        <span class="log-line text-red">> Warning: Manually bypassing session key protection.</span>
        <span class="log-line text-yellow">> Decrypted plain-text packet headers readable.</span>
        <span class="log-line text-red">> Warning: E2E security rating degraded to 0%.</span>
      `;
    }
  }

  // 7. Toast Notifier Factory
  createToast(message, typeClass = "toast-cyan") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast glass-card ${typeClass}`;
    toast.innerHTML = `
      <div class="toast-body">${message}</div>
      <button class="toast-close-btn" onclick="this.parentElement.remove()"><i data-lucide="x" style="width:12px;height:12px;"></i></button>
    `;
    container.appendChild(toast);
    this.initLucide();

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'toastSlideIn 0.3s ease reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // 8. SPA Transitions: Landing Page -> Dashboard
  showDashboard() {
    const landing = document.getElementById('landing-view');
    const dashboard = document.getElementById('dashboard-view');
    
    // Fade out landing
    landing.style.transition = 'opacity 0.4s ease';
    landing.style.opacity = '0';
    
    setTimeout(() => {
      landing.classList.remove('active');
      dashboard.classList.add('active');
      dashboard.style.opacity = '0';
      
      // Trigger browser redraw
      setTimeout(() => {
        dashboard.style.transition = 'opacity 0.4s ease';
        dashboard.style.opacity = '1';
        this.currentView = 'dashboard';
        this.initDashboardCharts();
        this.switchTab('overview');
        this.initLucide();
        this.createToast(`Workspace session established. Welcome back ${this.username || 'Alex'}!`, "toast-purple");
        // Start synthetic bandwidth updates
        this.startMockBandwidthUpdates();
      }, 50);
    }, 400);
  }

  logout() {
    const landing = document.getElementById('landing-view');
    const dashboard = document.getElementById('dashboard-view');
    
    dashboard.style.transition = 'opacity 0.4s ease';
    dashboard.style.opacity = '0';

    this.stopCameraStream();
    this.stopMicDiagnostics();
    clearInterval(this.meetingTimerInterval);
    
    setTimeout(() => {
      dashboard.classList.remove('active');
      landing.classList.add('active');
      landing.style.opacity = '0';
      
      setTimeout(() => {
        landing.style.transition = 'opacity 0.4s ease';
        landing.style.opacity = '1';
        this.currentView = 'landing';
        this.initLucide();
      }, 50);
    }, 400);
  }

  // 9. Dashboard Tab switcher
  switchTab(tabId) {
    const leavingMeetings = (this.activeTab === 'meetings' && tabId !== 'meetings');
    
    this.activeTab = tabId;
    
    // Reset Active Nav Button styles
    const navItems = document.querySelectorAll('.dash-nav-item');
    navItems.forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabId) {
        item.classList.add('active');
      }
    });

    // Toggle Content views
    const tabPanels = document.querySelectorAll('.dash-tab-content');
    tabPanels.forEach(panel => {
      panel.classList.remove('active');
    });

    const targetPanel = document.getElementById(`tab-${tabId}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    // Set header text dynamically
    const titleHeader = document.getElementById('dash-view-title');
    const titlesMapping = {
      overview: "Dashboard Overview",
      meetings: "Secure Meeting Room",
      whiteboard: "Collaborative Whiteboard Canvas",
      chat: "Team Discussion Channels",
      friends: "Workspace Network & Friends Hub",
      files: "Safe Sharing Vault",
      settings: "System Diagnostics & Settings"
    };
    titleHeader.textContent = titlesMapping[tabId] || "ConnectX Workspace";

    // Handle tab-specific actions
    if (tabId === 'meetings') {
      this.startCameraStream();
      this.startMeetingTimer();
      this.joinMeetingRoom();
    } else {
      this.stopCameraStream();
      clearInterval(this.meetingTimerInterval);
      if (leavingMeetings) {
        this.leaveMeetingRoom();
      }
    }

    if (tabId === 'whiteboard') {
      // Delay to ensure flex grid finishes layout before sizing whiteboard canvas
      setTimeout(() => this.resizeWhiteboardCanvas(), 100);
    }
  }

  // Collapsible Sidebar Drawer Logic
  toggleSidebar() {
    const sidebar = document.getElementById('dash-sidebar');
    const collapseIcon = document.getElementById('collapse-icon');
    sidebar.classList.toggle('collapsed');
    
    const isCollapsed = sidebar.classList.contains('collapsed');
    collapseIcon.setAttribute('data-lucide', isCollapsed ? 'chevrons-right' : 'chevrons-left');
    this.initLucide();

    // Trigger canvas resizing
    if (this.activeTab === 'whiteboard') {
      setTimeout(() => this.resizeWhiteboardCanvas(), 150);
    }
  }

  toggleSidebarMobile() {
    const sidebar = document.getElementById('dash-sidebar');
    sidebar.classList.toggle('expanded-mobile');
  }

  // Close mobile sidebar on click outside or menu click
  initThemeAccent() {
    const sidebar = document.getElementById('dash-sidebar');
    window.addEventListener('click', (e) => {
      if (window.innerWidth <= 1024) {
        if (!sidebar.contains(e.target) && !e.target.closest('.sidebar-expand-mobile')) {
          sidebar.classList.remove('expanded-mobile');
        }
      }
    });
  }

  // 10. Dashboard Analytics Chart Setup
  initDashboardCharts() {
    const canvas = document.getElementById('bandwidth-chart');
    if (!canvas || this.bandwidthChart) return;

    const ctx = canvas.getContext('2d');
    
    // Create glowing neon gradients
    const cyanGlow = ctx.createLinearGradient(0, 0, 0, 200);
    cyanGlow.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
    cyanGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');

    const purpleGlow = ctx.createLinearGradient(0, 0, 0, 200);
    purpleGlow.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
    purpleGlow.addColorStop(1, 'rgba(168, 85, 247, 0)');

    this.bandwidthChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm'],
        datasets: [
          {
            label: 'Uplink (GB)',
            data: [20, 35, 45, 30, 60, 80, 75],
            borderColor: '#06b6d4',
            backgroundColor: cyanGlow,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#06b6d4',
            pointBorderColor: '#fff',
            pointHoverRadius: 7,
            borderWidth: 3
          },
          {
            label: 'Downlink (GB)',
            data: [40, 50, 75, 55, 90, 110, 95],
            borderColor: '#a855f7',
            backgroundColor: purpleGlow,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#a855f7',
            pointBorderColor: '#fff',
            pointHoverRadius: 7,
            borderWidth: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans', size: 10 } }
          }
        }
      }
    });
  }

  startMockBandwidthUpdates() {
    setInterval(() => {
      if (this.bandwidthChart && this.currentView === 'dashboard') {
        const uplinkData = this.bandwidthChart.data.datasets[0].data;
        const downlinkData = this.bandwidthChart.data.datasets[1].data;

        // Shift old value and push slightly varying active workloads
        uplinkData.shift();
        uplinkData.push(Math.round(40 + Math.random() * 45));

        downlinkData.shift();
        downlinkData.push(Math.round(60 + Math.random() * 55));

        this.bandwidthChart.update('none'); // silent update
      }
    }, 4000);
  }

  // 11. Whiteboard Canvas Draw Controller (HTML5)
  initWhiteboardCanvas() {
    this.canvas = document.getElementById('whiteboard-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    
    // Bind draw mouse methods
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => this.stopDrawing());

    // Bind drawing touches for mobile/tablets
    this.canvas.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      this.isDrawing = true;
      this.lastX = touch.clientX - rect.left;
      this.lastY = touch.clientY - rect.top;
      e.preventDefault();
    });
    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.isDrawing) return;
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(x, y);
      this.ctx.strokeStyle = this.drawingTool === 'erase' ? '#ffffff' : this.brushColor;
      this.ctx.lineWidth = this.brushSize;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.stroke();

      this.lastX = x;
      this.lastY = y;
      e.preventDefault();
    });
    this.canvas.addEventListener('touchend', () => this.stopDrawing());

    window.addEventListener('resize', () => {
      if (this.activeTab === 'whiteboard') this.resizeWhiteboardCanvas();
    });
  }

  resizeWhiteboardCanvas() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    
    // Cache current canvas drawing content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.canvas, 0, 0);

    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;

    // Restore old sketches
    this.ctx.drawImage(tempCanvas, 0, 0);
  }

  startDrawing(e) {
    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.lastX = e.clientX - rect.left;
    this.lastY = e.clientY - rect.top;
  }

  draw(e) {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    
    // Choose drawing style vs eraser background fill
    const strokeColor = this.drawingTool === 'erase' ? '#ffffff' : this.brushColor;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();

    if (this.isSocketConnected) {
      this.socket.emit('whiteboard-draw', {
        x0: this.lastX,
        y0: this.lastY,
        x1: x,
        y1: y,
        color: strokeColor,
        size: this.brushSize
      });
    }

    this.lastX = x;
    this.lastY = y;
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  setWhiteboardTool(tool) {
    this.drawingTool = tool;
    document.querySelectorAll('.wb-tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`wb-tool-${tool}`).classList.add('active');
  }

  setWhiteboardColor(color, element) {
    this.brushColor = color;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    element.classList.add('active');
    
    // Auto shift tool to pencil drawing if color changed
    this.setWhiteboardTool('draw');
  }

  setWhiteboardStrokeSize(size) {
    this.brushSize = size;
  }

  clearWhiteboardCanvas() {
    if (!this.canvas || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.createToast("Whiteboard vectors cleared completely.", "toast-cyan");
    if (this.isSocketConnected) {
      this.socket.emit('whiteboard-clear');
    }
  }

  // 12. Real-Time Video Call Integration & Simulation
  async startCameraStream() {
    const localVideo = document.getElementById('local-webcam-stream');
    const fallback = document.getElementById('local-cam-fallback');
    const micTag = document.getElementById('local-mic-tag');

    // Try fetching actual media device camera stream
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true
      });
      
      localVideo.srcObject = this.localStream;
      localVideo.style.display = 'block';
      fallback.style.display = 'none';

      // Stream successfully acquired, set mic tag active
      micTag.classList.remove('muted');
      micTag.innerHTML = `<i data-lucide="mic"></i>`;
      this.initLucide();
      this.createToast("Local HD Camera and Mic feed linked.", "toast-cyan");
    } catch (err) {
      console.warn("Could not acquire actual media camera stream: ", err.message);
      
      // Unhide glowing futuristic placeholder fallback
      localVideo.style.display = 'none';
      fallback.style.display = 'flex';
      this.createToast("Camera stream fallback initialized.", "toast-purple");
    }
  }

  stopCameraStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    const localVideo = document.getElementById('local-webcam-stream');
    if (localVideo) localVideo.srcObject = null;
  }

  startMeetingTimer() {
    const timerText = document.getElementById('meeting-room-timer');
    this.meetingDuration = 0;
    
    clearInterval(this.meetingTimerInterval);
    this.meetingTimerInterval = setInterval(() => {
      this.meetingDuration++;
      const hrs = Math.floor(this.meetingDuration / 3600).toString().padStart(2, '0');
      const mins = Math.floor((this.meetingDuration % 3600) / 60).toString().padStart(2, '0');
      const secs = (this.meetingDuration % 60).toString().padStart(2, '0');
      timerText.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
  }

  // Toggle Mute mic
  toggleLocalAudio() {
    const btn = document.getElementById('btn-toggle-mic');
    const icon = document.getElementById('icon-toggle-mic');
    const localMicTag = document.getElementById('local-mic-tag');

    btn.classList.toggle('active');
    
    const isMuted = btn.classList.contains('active');
    icon.setAttribute('data-lucide', isMuted ? 'mic' : 'mic-off');
    this.initLucide();

    if (localMicTag) {
      if (isMuted) {
        localMicTag.classList.remove('muted');
        localMicTag.innerHTML = `<i data-lucide="mic"></i>`;
        this.createToast("Microphone unmuted.", "toast-cyan");
      } else {
        localMicTag.classList.add('muted');
        localMicTag.innerHTML = `<i data-lucide="mic-off"></i>`;
        this.createToast("Microphone muted.", "toast-magenta");
      }
      this.initLucide();
    }

    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = isMuted;
    }
  }

  // Toggle local Video transmission stream
  toggleLocalVideo() {
    const btn = document.getElementById('btn-toggle-video');
    const icon = document.getElementById('icon-toggle-video');
    const localVideo = document.getElementById('local-webcam-stream');
    const fallback = document.getElementById('local-cam-fallback');

    btn.classList.toggle('active');
    const isVideoActive = btn.classList.contains('active');

    icon.setAttribute('data-lucide', isVideoActive ? 'video' : 'video-off');
    this.initLucide();

    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = isVideoActive;
    }

    if (isVideoActive) {
      if (this.localStream) {
        localVideo.style.display = 'block';
        fallback.style.display = 'none';
      }
      this.createToast("Camera stream resumed.", "toast-cyan");
    } else {
      localVideo.style.display = 'none';
      fallback.style.display = 'flex';
      this.createToast("Camera feed suspended.", "toast-magenta");
    }
  }

  toggleLocalScreen() {
    const btn = document.getElementById('btn-toggle-screen');
    btn.classList.toggle('active');
    const isSharing = btn.classList.contains('active');
    
    if (isSharing) {
      this.createToast("Mock Screen sharing mode started.", "toast-purple");
    } else {
      this.createToast("Screen sharing halted.", "toast-cyan");
    }
  }

  toggleMeetingRecording() {
    const btn = document.getElementById('btn-toggle-record');
    btn.classList.toggle('active');
    const isRecording = btn.classList.contains('active');
    
    if (isRecording) {
      this.createToast("Meeting recording active. Saving to secure cloud node...", "toast-magenta");
    } else {
      this.createToast("Recording finalized successfully.", "toast-cyan");
    }
  }

  switchMeetingSideTab(tab) {
    const tabUsersBtn = document.getElementById('msp-tab-users');
    const tabChatBtn = document.getElementById('msp-tab-chat');
    const usersContent = document.getElementById('msp-content-users');
    const chatContent = document.getElementById('msp-content-chat');

    if (tab === 'users') {
      tabUsersBtn.classList.add('active');
      tabChatBtn.classList.remove('active');
      usersContent.style.display = 'block';
      chatContent.style.display = 'none';
    } else {
      tabUsersBtn.classList.remove('active');
      tabChatBtn.classList.add('active');
      usersContent.style.display = 'none';
      chatContent.style.display = 'flex';
    }
  }

  sendMeetingQuickChat() {
    const input = document.getElementById('meeting-quick-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (this.isSocketConnected) {
      this.socket.emit('chat-msg', {
        channel: 'meeting-room',
        msg: msg
      });
      input.value = '';
    } else {
      const chatBox = document.getElementById('meeting-quick-chat-box');
      const bubble = document.createElement('div');
      bubble.className = 'mq-bubble';
      bubble.innerHTML = `
        <span class="mq-sender">Alex Rivera (You):</span>
        <p class="mq-text">${msg}</p>
      `;
      chatBox.appendChild(bubble);
      chatBox.scrollTop = chatBox.scrollHeight;
      input.value = '';

      // Play synthesis chime sound
      this.synthesizeNotificationSound();
    }
  }

  // 13. Slack-Style Channel Chat Simulation
  switchChannel(channelName) {
    this.activeChannel = channelName;
    document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
    
    const activeItem = document.querySelector(`.channel-item[data-channel="${channelName}"]`);
    if (activeItem) activeItem.classList.add('active');

    document.getElementById('active-channel-title').textContent = `#${channelName}`;
    const descEl = document.querySelector('.active-channel-desc');
    const descs = {
      general: "Welcome to the central general channel. Start your communication.",
      engineering: "Deep tech logs, stack questions, SOC2 audits and security discussions.",
      marketing: "Pitch layouts, public relations releases, and design presentations.",
      "ai-summaries": "AI generated action briefs, dynamic notes index files, and transcript files."
    };
    descEl.textContent = descs[channelName] || "Cooperative channel stream.";

    // Load templates
    const stream = document.getElementById('chat-messages-stream');
    if (!stream) return;
    stream.innerHTML = '';
    
    if (this.isSocketConnected) {
      stream.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">Loading conversation...</div>`;
      this.socket.emit('get-chat-history', channelName);
    } else {
      if (channelName === 'general') {
        stream.innerHTML = `
          <div class="chat-msg-row">
            <div class="t-avatar avatar-cyan avatar-sm">SC</div>
            <div class="chat-msg-details">
              <span class="cm-sender">Sarah Chen <span class="cm-time">10:45 AM</span></span>
              <p class="cm-body">Good morning engineers. I have finalized the core pricing models. Let me know if the discount logic fits our structure.</p>
            </div>
          </div>
          <div class="chat-msg-row">
            <div class="t-avatar avatar-magenta avatar-sm">MK</div>
            <div class="chat-msg-details">
              <span class="cm-sender">Marcus K. <span class="cm-time">10:47 AM</span></span>
              <p class="cm-body">The Pro card has a gorgeous neon glow, Sarah! Perfect Apple/Linear style aesthetic.</p>
            </div>
          </div>
        `;
      } else if (channelName === 'engineering') {
        stream.innerHTML = `
          <div class="chat-msg-row">
            <div class="t-avatar avatar-blue avatar-sm">DR</div>
            <div class="chat-msg-details">
              <span class="cm-sender">David R. <span class="cm-time">Yesterday</span></span>
              <p class="cm-body">Finished dynamic encryption tunnel security testing. Edge signaling servers latency looks solid (< 10ms).</p>
            </div>
          </div>
        `;
      } else if (channelName === 'marketing') {
        stream.innerHTML = `
          <div class="chat-msg-row">
            <div class="t-avatar avatar-cyan avatar-sm">SC</div>
            <div class="chat-msg-details">
              <span class="cm-sender">Sarah Chen <span class="cm-time">2 days ago</span></span>
              <p class="cm-body">We are aiming to present the product showcase slides to initial enterprise clients on Friday.</p>
            </div>
          </div>
        `;
      } else if (channelName === 'ai-summaries') {
        stream.innerHTML = `
          <div class="chat-msg-row">
            <div class="t-avatar avatar-purple avatar-sm">AI</div>
            <div class="chat-msg-details">
              <span class="cm-sender">ConnectX Assistant <span class="cm-time">11:00 AM</span></span>
              <p class="cm-body"><strong>💡 ConnectX AI Action Summary - Operations Standup:</strong><br>
              • Alex Rivera resolved STUN/TURN fallback servers setup.<br>
              • Marcus K. updated Whiteboard canvas responsive grid handlers.<br>
              • David R. confirmed AES-256 SOC2 security compliance is verified.<br>
              • Next Milestone: Launch showcase demo test tomorrow morning.</p>
            </div>
          </div>
        `;
      }
    }
  }

  sendChatMessage() {
    const input = document.getElementById('chat-main-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (this.isSocketConnected) {
      this.socket.emit('chat-msg', {
        channel: this.activeChannel,
        msg: msg
      });
      input.value = '';
    } else {
      const stream = document.getElementById('chat-messages-stream');
      const row = document.createElement('div');
      row.className = 'chat-msg-row';
      row.innerHTML = `
        <div class="t-avatar avatar-purple avatar-sm">AR</div>
        <div class="chat-msg-details">
          <span class="cm-sender">Alex Rivera (You) <span class="cm-time">Now</span></span>
          <p class="cm-body">${msg}</p>
        </div>
      `;
      stream.appendChild(row);
      stream.scrollTop = stream.scrollHeight;
      input.value = '';

      // Play synthesis sound
      this.synthesizeNotificationSound();

      // Trigger mock response after 1.5s
      const channel = this.activeChannel;
      if (this.mockPeerReplies[channel] && this.replyIndex[channel] < this.mockPeerReplies[channel].length) {
        const typingIndicator = document.getElementById('chat-typing-row');
        const typingText = typingIndicator.querySelector('.typing-text');
        
        const nextReply = this.mockPeerReplies[channel][this.replyIndex[channel]];
        typingText.textContent = `${nextReply.sender} is typing...`;
        
        setTimeout(() => {
          typingIndicator.style.display = 'flex';
          stream.scrollTop = stream.scrollHeight;
        }, 500);

        setTimeout(() => {
          typingIndicator.style.display = 'none';
          
          const replyRow = document.createElement('div');
          replyRow.className = 'chat-msg-row';
          
          const avatarMap = { "Sarah Chen": "SC", "Marcus K.": "MK", "David R.": "DR" };
          const colorMap = { "Sarah Chen": "avatar-cyan", "Marcus K.": "avatar-magenta", "David R.": "avatar-blue" };
          
          const sender = nextReply.sender;
          const avatarStr = avatarMap[sender] || "PE";
          const colorStr = colorMap[sender] || "avatar-cyan";

          replyRow.innerHTML = `
            <div class="t-avatar ${colorStr} avatar-sm">${avatarStr}</div>
            <div class="chat-msg-details">
              <span class="cm-sender">${sender} <span class="cm-time">Now</span></span>
              <p class="cm-body">${nextReply.msg}</p>
            </div>
          `;
          stream.appendChild(replyRow);
          stream.scrollTop = stream.scrollHeight;
          
          this.replyIndex[channel]++;
          this.synthesizeNotificationSound();
        }, 2000);
      }
    }
  }

  // Synthesis chimes using Web Audio API (highly professional!)
  synthesizeNotificationSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Pitch (A5)
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1); // High chime pitch
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35); // quick decay
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn("Web Audio synthesis error: ", e.message);
    }
  }

  // 14. Drag-Drop Secure File Share controller
  initFileUploader() {
    const zone = document.getElementById('file-drop-zone');
    if (!zone) return;

    ['dragenter', 'dragover'].forEach(name => {
      zone.addEventListener(name, (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(name => {
      zone.addEventListener(name, (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
      }, false);
    });

    zone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      this.handleFileUploaded(files[0]);
    });
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) this.handleFileUploaded(file);
  }

  handleFileUploaded(file) {
    if (!file) return;

    const tableBody = document.getElementById('shared-files-table-body');
    const uploaderZone = document.getElementById('file-drop-zone');
    
    // Add mock uploading feedback
    uploaderZone.innerHTML = `
      <i class="upload-icon text-cyan" style="animation: bounceDot1 2s infinite ease-in-out;"><i data-lucide="shield"></i></i>
      <h3>Securing Asset Upload...</h3>
      <div class="progress-bar-container" style="width: 80%;"><div class="progress-bar-fill" id="up-progress-fill" style="width: 0%"></div></div>
      <span class="vault-sec-tag">Generating E2E file encryption hash keys</span>
    `;
    this.initLucide();

    if (this.isSocketConnected) {
      // Real file upload to express backend
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploader', this.username);

      let progress = 0;
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + 15, 90); // hold at 90% until fetch returns
        const fill = document.getElementById('up-progress-fill');
        if (fill) fill.style.width = `${progress}%`;
      }, 100);

      fetch('/upload', {
        method: 'POST',
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        clearInterval(progressInterval);
        const fill = document.getElementById('up-progress-fill');
        if (fill) fill.style.width = `100%`;
        
        setTimeout(() => {
          this.restoreUploaderUI();
          this.createToast(`File "${file.name}" uploaded successfully!`, "toast-cyan");
        }, 400);
      })
      .catch(err => {
        clearInterval(progressInterval);
        console.error('File upload failed', err);
        this.createToast("File upload failed.", "toast-magenta");
        this.restoreUploaderUI();
      });
    } else {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        const fill = document.getElementById('up-progress-fill');
        if (fill) fill.style.width = `${progress}%`;

        if (progress >= 100) {
          clearInterval(interval);
          
          // Restore Uploader UI
          uploaderZone.innerHTML = `
            <i data-lucide="upload-cloud" class="upload-icon text-cyan"></i>
            <h3>Secure Upload Vault</h3>
            <p>Drag and drop any files here or click below to secure them. Files are scanned, encrypted with AES-256 protocols, and stored instantly.</p>
            <input type="file" id="file-uploader-input" style="display:none;" onchange="app.handleFileSelect(event)">
            <button class="btn btn-primary" onclick="document.getElementById('file-uploader-input').click()">
              Select Files to Secure
            </button>
            <span class="vault-sec-tag"><i data-lucide="shield-check" class="text-cyan"></i> AES-256 Cloud Shield Engaged</span>
          `;
          this.initLucide();
          this.initFileUploader();

          // Calculate friendly size string
          const sizeStr = file.size > 1024 * 1024 
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
            : `${(file.size / 1024).toFixed(0)} KB`;

          // Append item to files list table
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>
              <div class="file-name-cell">
                <i data-lucide="file" class="text-cyan"></i>
                <span>${file.name}</span>
              </div>
            </td>
            <td>${sizeStr}</td>
            <td>Alex Rivera</td>
            <td><span class="badge-active-green"><i data-lucide="lock" style="width:10px;height:10px;"></i> Secured</span></td>
            <td><button class="hi-action-btn" onclick="app.downloadMockFile('${file.name}')"><i data-lucide="download"></i></button></td>
          </tr>
          `;
          tableBody.appendChild(row);
          
          // Update files badge count
          const rowsCount = tableBody.querySelectorAll('tr').length;
          document.getElementById('files-count-badge').textContent = `${rowsCount} Files Shared`;
          
          this.initLucide();
          this.createToast(`File "${file.name}" uploaded and encrypted successfully!`, "toast-cyan");
        }
      }, 150);
    }
  }

  downloadMockFile(name) {
    this.createToast(`Initiating AES-256 decrypt cipher for "${name}"...`, "toast-purple");
    setTimeout(() => {
      this.createToast(`Decryption successful. Downloading file!`, "toast-cyan");
    }, 1000);
  }

  // 15. User Diagnostics Controls - Mic tester
  startMicDiagnostics() {
    const btn = document.getElementById('btn-mic-diag');
    const fill = document.getElementById('mic-tester-fill');
    
    if (this.micInterval) {
      this.stopMicDiagnostics();
      return;
    }

    btn.textContent = "Halt Test";
    this.createToast("Measuring mic capture decibels...", "toast-cyan");

    this.micInterval = setInterval(() => {
      const vol = Math.floor(Math.random() * 95); // Simulated levels
      fill.style.width = `${vol}%`;
    }, 100);
  }

  stopMicDiagnostics() {
    const btn = document.getElementById('btn-mic-diag');
    const fill = document.getElementById('mic-tester-fill');
    
    if (this.micInterval) {
      clearInterval(this.micInterval);
      this.micInterval = null;
    }

    if (btn) btn.textContent = "Test Microphone";
    if (fill) fill.style.width = '0%';
  }

  saveUserSettings() {
    const name = document.getElementById('set-username').value.trim();
    const status = document.getElementById('set-userstatus').value.trim();

    if (name) {
      this.username = name;
      document.getElementById('profile-name-display').textContent = name;
      document.getElementById('greeting-username').textContent = name;
      
      // Update avatar characters
      const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const avatars = [document.getElementById('avatar-display'), document.getElementById('local-avatar-tag')];
      avatars.forEach(av => {
        if (av) av.textContent = initials;
      });

      if (this.isSocketConnected) {
        this.socket.emit('user-register', {
          username: name,
          role: 'Workspace Administrator'
        });
      }

      this.createToast("Settings configuration saved successfully.", "toast-purple");
    }
  }

  resetSettingsForm() {
    document.getElementById('set-username').value = "Alex Rivera";
    document.getElementById('set-userstatus').value = "";
    document.getElementById('cam-quality-select').value = "720p";
    this.createToast("Settings fields reset to default.", "toast-cyan");
  }

  // Top notifications toggles
  toggleNotificationMenu() {
    const nd = document.getElementById('notification-dropdown');
    nd.classList.toggle('active');
  }

  clearNotifications() {
    const list = document.getElementById('notification-list');
    list.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No unread system alerts.</div>`;
    document.querySelector('.notif-badge').style.display = 'none';
    this.createToast("Notifications cleared.", "toast-cyan");
  }

  subscribeNewsletter() {
    const email = document.getElementById('newsletter-email').value;
    if (email) {
      this.createToast(`Success! Linked newsletter subscription to "${email}"`, "toast-purple");
      document.getElementById('newsletter-email').value = '';
    }
  }

  playDemoVideo() {
    this.createToast("Watch Demo modal activated. High definition mockup stream launched!", "toast-purple");
  }
}

// Instantiate global app engine
const app = new ConnectXApp();
window.app = app;
