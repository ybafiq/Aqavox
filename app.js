        const IMAGE_API_BASE = "https://image.pollinations.ai/prompt";
        const TEXT_API_BASE = "https://text.pollinations.ai";

        let conversationHistory = [];
        let savedSessions = {}; 
        let currentSessionId = null;
        let isVisionModeActive = false;
        let isWebSearchActive = false;
        let uploadedFiles = [];
        let currentUtterance = null;
        let speechRecognition = null;
        let isListening = false;
        let sessionTitles = {};
        let pinnedSessionIds = [];

        const promptInput = document.getElementById('prompt-input');
        const submitBtn = document.getElementById('submit-btn');
        const chatFeed = document.getElementById('chat-feed');
        const chatFeedInner = document.getElementById('chat-feed-inner');
        const welcomeHero = document.getElementById('welcome-hero');
        const historyListTarget = document.getElementById('history-list-target');
        
        const inputContainer = document.getElementById('input-container');
        const vaultGridTarget = document.getElementById('vault-grid-target');
        
        const chatModelSelect = document.getElementById('chat-model');
        const modelSelect = document.getElementById('model');
        const widthInput = document.getElementById('width');
        const heightInput = document.getElementById('height');
        const seedInput = document.getElementById('seed');
        const apiKeyInput = document.getElementById('api-key');
        const themeSelect = document.getElementById('app-theme');
        const systemInstructionInput = document.getElementById('system-instruction');

        async function loadModelsList() {
            try {
                const response = await fetchWithRetry("https://gen.pollinations.ai/v1/models");
                if (!response.ok) throw new Error("Failed to load models list");
                const resData = await response.json();
                const models = resData.data || [];
                
                const prevChatModel = chatModelSelect.value;
                const prevImgModel = modelSelect.value;

                chatModelSelect.innerHTML = "";
                modelSelect.innerHTML = "";

                const textModels = [];
                const imgModels = [];

                models.forEach(m => {
                    if (m.paid_only) return; 

                    const isText = m.output_modalities?.includes("text") || 
                                   m.supported_endpoints?.includes("/v1/chat/completions") ||
                                   m.supported_endpoints?.includes("/text");
                    const isImage = m.output_modalities?.includes("image") || 
                                    m.supported_endpoints?.includes("/v1/images/generations") ||
                                    m.supported_endpoints?.includes("/image/{prompt}");

                    if (isText && !m.is_specialized && m.id !== "qwen-safety") {
                        textModels.push(m);
                    }
                    if (isImage) {
                        imgModels.push(m);
                    }
                });

                textModels.sort((a,b) => (a.title || a.id).localeCompare(b.title || b.id));
                imgModels.sort((a,b) => (a.title || a.id).localeCompare(b.title || b.id));

                if (textModels.length === 0) throw new Error("No text models found");

                textModels.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.id;
                    opt.textContent = `${m.title || m.id} ${m.reasoning ? '(Reasoning)' : ''} - ${m.description || ''}`;
                    chatModelSelect.appendChild(opt);
                });

                imgModels.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.id;
                    opt.textContent = `${m.title || m.id} - ${m.description || ''}`;
                    modelSelect.appendChild(opt);
                });

                if (Array.from(chatModelSelect.options).some(o => o.value === prevChatModel)) {
                    chatModelSelect.value = prevChatModel;
                } else if (localStorage.getItem('ystudio_chat_model')) {
                    chatModelSelect.value = localStorage.getItem('ystudio_chat_model');
                }
                
                if (Array.from(modelSelect.options).some(o => o.value === prevImgModel)) {
                    modelSelect.value = prevImgModel;
                } else if (localStorage.getItem('ystudio_img_model')) {
                    modelSelect.value = localStorage.getItem('ystudio_img_model');
                }
            } catch (e) {
                console.error("Dynamic model fetching failed, loading curated fallbacks", e);
                loadCuratedFallbackModels();
            }
        }

        function loadCuratedFallbackModels() {
            const fallbackText = [
                { id: "openai", name: "GPT-5.4 Nano (Fast & Balanced)" },
                { id: "gpt-5.4", name: "GPT-5.4 (Frontier Reasoning)" },
                { id: "openai-large", name: "GPT-5.5 (Frontier Reasoning)" },
                { id: "deepseek", name: "DeepSeek V4 Flash (Fast & Code)" },
                { id: "deepseek-pro", name: "DeepSeek V4 Pro (Advanced Reasoning)" },
                { id: "grok", name: "Grok 4.20 Non-Reasoning" },
                { id: "llama", name: "Meta Llama 3.3 70B (General Chat)" },
                { id: "mistral", name: "Mistral Small 4 (Unified Reasoning)" },
                { id: "qwen-coder", name: "Qwen3 Coder 30B (Code Specialist)" }
            ];

            const fallbackImg = [
                { id: "flux", name: "FLUX.1 Base (High Fidelity Master)" },
                { id: "ideogram-v4-turbo", name: "Ideogram v4 Turbo (Crisp Typography & Design)" },
                { id: "grok-imagine", name: "Grok Imagine (Advanced xAI Generation)" },
                { id: "wan-image", name: "Wan 2.1 Image (State of the Art Open Source)" },
                { id: "flux-realism", name: "FLUX Realism (Photorealistic Tones)" },
                { id: "flux-anime", name: "FLUX Anime (Illustrative Manga)" },
                { id: "turbo", name: "SDXL-Turbo (Instant Lightning Render)" }
            ];

            chatModelSelect.innerHTML = "";
            modelSelect.innerHTML = "";

            fallbackText.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m.id;
                opt.textContent = m.name;
                chatModelSelect.appendChild(opt);
            });

            fallbackImg.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m.id;
                opt.textContent = m.name;
                modelSelect.appendChild(opt);
            });
            
            if(localStorage.getItem('ystudio_chat_model')) chatModelSelect.value = localStorage.getItem('ystudio_chat_model');
            if(localStorage.getItem('ystudio_img_model')) modelSelect.value = localStorage.getItem('ystudio_img_model');
        }

        function applyTheme(themeName) {
            document.body.classList.remove('theme-light', 'theme-cyber');
            if (themeName === 'light') {
                document.body.classList.add('theme-light');
            } else if (themeName === 'cyber') {
                document.body.classList.add('theme-cyber');
            }
            localStorage.setItem('ystudio_theme', themeName);
        }

        themeSelect.addEventListener('change', () => {
            applyTheme(themeSelect.value);
        });

        window.addEventListener('DOMContentLoaded', async () => {
            initAuth();
            if(localStorage.getItem('ystudio_width')) widthInput.value = localStorage.getItem('ystudio_width');
            if(localStorage.getItem('ystudio_height')) heightInput.value = localStorage.getItem('ystudio_height');
            if(localStorage.getItem('ystudio_seed')) seedInput.value = localStorage.getItem('ystudio_seed');
            if(localStorage.getItem('ystudio_api_key')) apiKeyInput.value = localStorage.getItem('ystudio_api_key');

            if (localStorage.getItem('ystudio_system_prompt')) {
                systemInstructionInput.value = localStorage.getItem('ystudio_system_prompt');
            } else {
                systemInstructionInput.value = "You are Aqavox, an elite, automated AI studio setup. If the user discusses, modifies, or tweaks an image that was previously output inline, you must adaptively engineer a full comprehensive description reflecting their requested adjustments. Then, append exactly this instruction string format at the very end of your response text block: [GENERATE_IMAGE: your descriptive prompt here].";
            }

            systemInstructionInput.addEventListener('input', () => {
                localStorage.setItem('ystudio_system_prompt', systemInstructionInput.value.trim());
            });

            const savedTheme = localStorage.getItem('ystudio_theme') || 'midnight';
            themeSelect.value = savedTheme;
            applyTheme(savedTheme);
            
            await loadModelsList();

            if (window.innerWidth > 768) {
                if(localStorage.getItem('ystudio_sidebar_hidden') === 'true') {
                    document.body.classList.add('sidebar-hidden');
                } else {
                    document.body.classList.remove('sidebar-hidden');
                }
            } else {
                document.body.classList.add('sidebar-hidden');
            }

            [chatModelSelect, modelSelect, widthInput, heightInput, seedInput].forEach(elem => {
                elem.addEventListener('change', () => {
                    localStorage.setItem('ystudio_chat_model', chatModelSelect.value);
                    localStorage.setItem('ystudio_img_model', modelSelect.value);
                    localStorage.setItem('ystudio_width', widthInput.value);
                    localStorage.setItem('ystudio_height', heightInput.value);
                    localStorage.setItem('ystudio_seed', seedInput.value);
                });
            });

            apiKeyInput.addEventListener('input', () => {
                localStorage.setItem('ystudio_api_key', apiKeyInput.value.trim());
            });

            const storedSessions = localStorage.getItem('aqavox_sessions');
            const storedActiveId = localStorage.getItem('aqavox_active_session_id');
            const storedTitles = localStorage.getItem('aqavox_session_titles');
            const storedPinned = localStorage.getItem('aqavox_pinned_sessions');

            if (storedSessions) {
                savedSessions = JSON.parse(storedSessions);
            }
            if (storedTitles) {
                try { sessionTitles = JSON.parse(storedTitles); } catch (e) { sessionTitles = {}; }
            }
            if (storedPinned) {
                try { pinnedSessionIds = JSON.parse(storedPinned); } catch (e) { pinnedSessionIds = []; }
            }

            if (storedActiveId && savedSessions[storedActiveId]) {
                currentSessionId = storedActiveId;
                conversationHistory = savedSessions[currentSessionId];
                if (conversationHistory.length > 1 && welcomeHero) welcomeHero.remove();
                rebuildFeedFromHistory();
            } else {
                createNewChatSession();
            }

            renderHistorySidebarList();
            updateVaultGrid();
            updateOnlineStatus();
            toggleVisionMode(false);
            adjustTextareaHeight();

            const historySearchInput = document.getElementById('history-search-input');
            if (historySearchInput) {
                historySearchInput.addEventListener('input', () => {
                    renderHistorySidebarList();
                });
            }
        });

        function updateOnlineStatus() {
            const banner = document.getElementById('offline-banner');
            if (!banner) return;
            banner.style.display = navigator.onLine ? 'none' : 'flex';
        }
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        function toggleSidebarState(e) {
            if (e) e.stopPropagation();
            const isHiddenNow = document.body.classList.toggle('sidebar-hidden');
            localStorage.setItem('ystudio_sidebar_hidden', isHiddenNow);
            setTimeout(scrollToBottom, 100);
        }

        function handleOutsideContentClick(e) {
            if (window.innerWidth <= 768 && !document.body.classList.contains('sidebar-hidden')) {
                document.body.classList.add('sidebar-hidden');
                localStorage.setItem('ystudio_sidebar_hidden', 'true');
            }
        }

        function handleBottomItemClick(tabName) {
            if (window.innerWidth <= 768 && document.body.classList.contains('sidebar-hidden')) {
                document.body.classList.remove('sidebar-hidden');
                localStorage.setItem('ystudio_sidebar_hidden', 'false');
            }
            switchSidebarTab(tabName);
        }

        // --- Plus Menu Operations (Gemini style) ---
        function togglePlusMenu(event) {
            if (event) event.stopPropagation();
            const menu = document.getElementById('plus-menu');
            if (!menu) return;
            const isHidden = (menu.style.display === 'none' || !menu.style.display);
            menu.style.display = isHidden ? 'flex' : 'none';
        }

        document.addEventListener('click', (event) => {
            const menu = document.getElementById('plus-menu');
            const plusBtn = document.getElementById('plus-btn');
            if (menu && menu.style.display === 'flex') {
                if (!menu.contains(event.target) && event.target !== plusBtn && !plusBtn.contains(event.target)) {
                    menu.style.display = 'none';
                }
            }
        });

        // --- Sidebar Footer Overflow Menu ---
        function toggleFooterMenu(event) {
            if (event) event.stopPropagation();
            const menu = document.getElementById('footer-menu');
            if (!menu) return;
            const isHidden = (menu.style.display === 'none' || !menu.style.display);
            menu.style.display = isHidden ? 'flex' : 'none';
        }

        document.addEventListener('click', (event) => {
            const menu = document.getElementById('footer-menu');
            if (!menu || menu.style.display !== 'flex') return;
            const overflow = menu.closest('.footer-overflow');
            if (overflow && !overflow.contains(event.target)) {
                menu.style.display = 'none';
            }
        });

        // ============================================================
        // Local Auth (client-side profile — stored on this device)
        // ============================================================
        let currentUser = null;
        let authMode = 'signin';

        function getAccounts() {
            try { return JSON.parse(localStorage.getItem('aqavox_accounts') || '{}'); }
            catch (e) { return {}; }
        }
        function saveAccounts(a) { localStorage.setItem('aqavox_accounts', JSON.stringify(a)); }

        async function hashPassword(pw) {
            const salt = 'aqavox_v1::';
            try {
                if (window.crypto && crypto.subtle) {
                    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pw));
                    return 'sha256$' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
                }
            } catch (e) { /* fall through to non-crypto fallback (e.g. insecure context) */ }
            let h = 5381; const s = salt + pw;
            for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); }
            return 'djb$' + (h >>> 0).toString(16);
        }

        // -----------------------------------------------------------------
        // Google Sign-In (Google Identity Services)
        // To enable: paste your Google OAuth Client ID below.
        //   1. Go to https://console.cloud.google.com/apis/credentials
        //   2. Create Credentials -> OAuth client ID -> Web application
        //   3. Under "Authorized JavaScript origins" add your site's origin
        //      (e.g. http://localhost:5500 or https://yourdomain.com).
        //      NOTE: Google does NOT allow file:// origins — serve the app
        //      over localhost or https for Google sign-in to work.
        //   4. Copy the Client ID (ends with .apps.googleusercontent.com) here.
        // -----------------------------------------------------------------
        const GOOGLE_CLIENT_ID = ""; // e.g. "1234567890-abc123.apps.googleusercontent.com"

        let googleReady = false;

        function onGoogleLibLoad() {
            googleReady = true;
            setupGoogleButton();
        }

        function setupGoogleButton() {
            const container = document.getElementById('google-btn-container');
            const fallback = document.getElementById('google-fallback-btn');
            if (!container) return;

            const configured = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.trim();
            const libOk = !!(window.google && google.accounts && google.accounts.id);

            if (configured && libOk) {
                try {
                    google.accounts.id.initialize({
                        client_id: GOOGLE_CLIENT_ID.trim(),
                        callback: handleGoogleCredential
                    });
                    container.innerHTML = '';
                    const isLight = document.body.classList.contains('theme-light');
                    google.accounts.id.renderButton(container, {
                        theme: isLight ? 'outline' : 'filled_black',
                        size: 'large',
                        text: 'continue_with',
                        shape: 'pill',
                        logo_alignment: 'left',
                        width: 344
                    });
                    container.style.display = 'flex';
                    if (fallback) fallback.style.display = 'none';
                    return;
                } catch (e) { /* fall through to fallback button */ }
            }

            container.style.display = 'none';
            if (fallback) fallback.style.display = 'flex';
        }

        function handleGoogleFallback() {
            setAuthError('Google sign-in isn\'t set up yet. Add your Google OAuth Client ID to GOOGLE_CLIENT_ID in the code, and serve the app over localhost or https (Google blocks file://).');
        }

        function decodeJwt(token) {
            try {
                const payload = token.split('.')[1];
                const json = decodeURIComponent(
                    atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
                        .split('')
                        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                        .join('')
                );
                return JSON.parse(json);
            } catch (e) { return null; }
        }

        function handleGoogleCredential(response) {
            const data = decodeJwt(response && response.credential);
            if (!data || !data.email) { setAuthError('Google sign-in failed. Please try again.'); return; }

            const email = data.email.toLowerCase();
            const name = data.name || data.given_name || email;
            const picture = data.picture || '';

            const accounts = getAccounts();
            accounts[email] = Object.assign(accounts[email] || {}, {
                name: name, email: email, provider: 'google', picture: picture,
                createdAt: (accounts[email] && accounts[email].createdAt) || Date.now()
            });
            saveAccounts(accounts);

            finishSignIn({ name: name, email: email, picture: picture, provider: 'google' });
        }

        function initAuth() {
            const stored = localStorage.getItem('aqavox_current_user');
            if (stored) {
                try { currentUser = JSON.parse(stored); } catch (e) { currentUser = null; }
            }
            if (currentUser) {
                hideAuthScreen();
            } else {
                showAuthScreen();
            }
            updateProfileUI();
        }

        function showAuthScreen() {
            const s = document.getElementById('auth-screen');
            if (s) { s.style.display = 'flex'; document.body.classList.add('auth-locked'); }
            switchAuthMode('signin');
            setAuthError('');
            setupGoogleButton();
            const email = document.getElementById('auth-email');
            if (email) setTimeout(() => email.focus(), 60);
        }
        function hideAuthScreen() {
            const s = document.getElementById('auth-screen');
            if (s) { s.style.display = 'none'; document.body.classList.remove('auth-locked'); }
        }

        function switchAuthMode(mode) {
            authMode = mode;
            const signinTab = document.getElementById('auth-tab-signin');
            const signupTab = document.getElementById('auth-tab-signup');
            const nameField = document.getElementById('auth-name-field');
            const submitBtn = document.getElementById('auth-submit-btn');
            const pwInput = document.getElementById('auth-password');
            if (signinTab) signinTab.classList.toggle('active', mode === 'signin');
            if (signupTab) signupTab.classList.toggle('active', mode === 'signup');
            if (nameField) nameField.style.display = (mode === 'signup') ? 'flex' : 'none';
            if (submitBtn) submitBtn.textContent = (mode === 'signup') ? 'Create Account' : 'Sign In';
            if (pwInput) pwInput.setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
            setAuthError('');
        }

        function setAuthError(msg) {
            const e = document.getElementById('auth-error');
            if (!e) return;
            e.textContent = msg || '';
            e.style.display = msg ? 'block' : 'none';
        }

        async function handleAuthSubmit(event) {
            if (event) event.preventDefault();
            const email = (document.getElementById('auth-email').value || '').trim().toLowerCase();
            const pw = document.getElementById('auth-password').value || '';
            const name = (document.getElementById('auth-name').value || '').trim();

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAuthError('Please enter a valid email address.'); return false; }
            if (pw.length < 4) { setAuthError('Password must be at least 4 characters.'); return false; }

            const accounts = getAccounts();
            const hash = await hashPassword(pw);

            if (authMode === 'signup') {
                if (!name) { setAuthError('Please enter your name.'); return false; }
                if (accounts[email]) { setAuthError('An account with this email already exists — try signing in.'); return false; }
                accounts[email] = { name: name, email: email, pass: hash, createdAt: Date.now() };
                saveAccounts(accounts);
                finishSignIn({ name: name, email: email });
            } else {
                const acc = accounts[email];
                if (!acc || acc.pass !== hash) { setAuthError('Incorrect email or password.'); return false; }
                finishSignIn({ name: acc.name, email: acc.email });
            }
            return false;
        }

        function finishSignIn(user) {
            currentUser = {
                name: user.name,
                email: user.email,
                picture: user.picture || '',
                provider: user.provider || 'local',
                guest: false
            };
            localStorage.setItem('aqavox_current_user', JSON.stringify(currentUser));
            ['auth-name', 'auth-email', 'auth-password'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            setAuthError('');
            hideAuthScreen();
            updateProfileUI();
        }

        function continueAsGuest() {
            currentUser = { name: 'Guest', email: '', guest: true };
            localStorage.setItem('aqavox_current_user', JSON.stringify(currentUser));
            hideAuthScreen();
            updateProfileUI();
        }

        function signOut() {
            localStorage.removeItem('aqavox_current_user');
            currentUser = null;
            closeProfileMenu();
            showAuthScreen();
            updateProfileUI();
        }

        function getInitials(user) {
            if (!user || user.guest) return 'G';
            const n = (user.name || user.email || 'U').trim();
            const parts = n.split(/\s+/);
            if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
            return n.slice(0, 2).toUpperCase();
        }

        function updateProfileUI() {
            const isGuest = !currentUser || currentUser.guest;
            const name = isGuest ? 'Guest' : (currentUser.name || currentUser.email);
            const email = isGuest ? 'Not signed in' : currentUser.email;
            const initials = getInitials(currentUser);
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('profile-name', name);
            set('profile-email', email);
            set('profile-menu-name', name);
            set('profile-menu-email', email);
            const photo = (!isGuest && currentUser.picture) ? currentUser.picture : '';
            ['profile-avatar', 'profile-avatar-lg'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (photo) {
                    el.textContent = '';
                    el.style.backgroundImage = `url("${photo}")`;
                    el.classList.add('has-photo');
                } else {
                    el.textContent = initials;
                    el.style.backgroundImage = '';
                    el.classList.remove('has-photo');
                }
            });
            set('profile-action-label', isGuest ? 'Sign in' : 'Sign out');
            document.querySelectorAll('.profile-avatar').forEach(a => a.classList.toggle('guest', isGuest && !photo));
        }

        function handleProfileAction() {
            const isGuest = !currentUser || currentUser.guest;
            closeProfileMenu();
            if (isGuest) { showAuthScreen(); }
            else { signOut(); }
        }

        function toggleProfileMenu(event) {
            if (event) event.stopPropagation();
            const m = document.getElementById('profile-menu');
            if (!m) return;
            const hidden = (m.style.display === 'none' || !m.style.display);
            m.style.display = hidden ? 'block' : 'none';
        }
        function closeProfileMenu() {
            const m = document.getElementById('profile-menu');
            if (m) m.style.display = 'none';
        }

        document.addEventListener('click', (event) => {
            const wrap = document.getElementById('sidebar-profile');
            const m = document.getElementById('profile-menu');
            if (m && m.style.display !== 'none' && wrap && !wrap.contains(event.target)) {
                m.style.display = 'none';
            }
        });

        function triggerMenuAttach(event) {
            if (event) event.stopPropagation();
            document.getElementById('plus-menu').style.display = 'none';
            triggerFileUpload();
        }

        function triggerMenuWebSearch(event) {
            if (event) event.stopPropagation();
            toggleWebSearch();
        }

        function triggerMenuImageMode(event) {
            if (event) event.stopPropagation();
            handleModeClick();
        }

        function createNewChatSession() {
            currentSessionId = "session_" + Date.now();
            
            const customPrompt = (systemInstructionInput && systemInstructionInput.value.trim()) 
                ? systemInstructionInput.value.trim() 
                : "You are Aqavox, an elite, automated AI studio setup. If the user discusses, modifies, or tweaks an image that was previously output inline, you must adaptively engineer a full comprehensive description reflecting their requested adjustments. Then, append exactly this instruction string format at the very end of your response text block: [GENERATE_IMAGE: your descriptive prompt here].";

            conversationHistory = [
                { 
                    role: "system", 
                    content: customPrompt
                }
            ];
            savedSessions[currentSessionId] = conversationHistory;
            safeSetLocalStorage('aqavox_active_session_id', currentSessionId);
            saveHistoryToStorage();
        }

        function startNewChat() {
            createNewChatSession();
            chatFeedInner.innerHTML = '';
            chatFeedInner.appendChild(welcomeHero);
            renderHistorySidebarList();
            updateVaultGrid();
            adjustTextareaHeight();
            uploadedFiles = [];
            renderFilePreviews();
            toggleArtifactsPane(false);
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (window.innerWidth <= 768) document.body.classList.add('sidebar-hidden');
        }

        function loadSavedChatSession(sessionId) {
            if (!savedSessions[sessionId]) return;
            currentSessionId = sessionId;
            conversationHistory = savedSessions[sessionId];
            safeSetLocalStorage('aqavox_active_session_id', currentSessionId);
            
            if (welcomeHero) welcomeHero.remove();
            rebuildFeedFromHistory();
            renderHistorySidebarList();
            updateVaultGrid();
            adjustTextareaHeight();
            uploadedFiles = [];
            renderFilePreviews();
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (window.innerWidth <= 768) document.body.classList.add('sidebar-hidden');
        }

        function safeSetLocalStorage(key, value, silent) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (err) {
                if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
                    if (!silent) {
                        appendSystemWarning(
                            "<strong>Storage limit reached.</strong><br><br>" +
                            "Your browser's local storage is full, so this chat could not be fully saved. " +
                            "Export important conversations (MD/JSON buttons in the sidebar) and use <strong>Clear Cache</strong> to free up space, then continue."
                        );
                    }
                } else {
                    console.error('localStorage write failed:', err);
                }
                return false;
            }
        }

        const MAX_SAVED_SESSIONS = 80;

        // Removes the oldest, unpinned sessions (never the active one) until at/below keepCount.
        // Returns true if anything was pruned.
        function pruneOldestUnpinnedSessions(keepCount) {
            const prunableIds = Object.keys(savedSessions)
                .filter(id => id !== currentSessionId && !pinnedSessionIds.includes(id))
                .sort((a, b) => a.split('_')[1] - b.split('_')[1]); // oldest first

            let pruned = false;
            while (Object.keys(savedSessions).length > keepCount && prunableIds.length) {
                const oldestId = prunableIds.shift();
                delete savedSessions[oldestId];
                delete sessionTitles[oldestId];
                pruned = true;
            }
            return pruned;
        }

        function saveHistoryToStorage() {
            savedSessions[currentSessionId] = conversationHistory;

            if (Object.keys(savedSessions).length > MAX_SAVED_SESSIONS) {
                pruneOldestUnpinnedSessions(MAX_SAVED_SESSIONS);
            }

            let ok = safeSetLocalStorage('aqavox_sessions', JSON.stringify(savedSessions), true);
            if (!ok) {
                const pruned = pruneOldestUnpinnedSessions(Math.max(10, Object.keys(savedSessions).length - 15));
                if (pruned) {
                    ok = safeSetLocalStorage('aqavox_sessions', JSON.stringify(savedSessions), true);
                    if (ok) {
                        appendSystemWarning("Freed up storage by removing some of your oldest, unpinned chats so this conversation could be saved. Pin any chats you want to keep permanently.");
                        renderHistorySidebarList();
                    }
                }
                if (!ok) {
                    appendSystemWarning(
                        "<strong>Storage limit reached.</strong><br><br>" +
                        "Your browser's local storage is full, so this chat could not be fully saved. " +
                        "Export important conversations (MD/JSON buttons in the sidebar) and use <strong>Clear Cache</strong> to free up space, then continue."
                    );
                }
            }
            updateVaultGrid();
        }

        function getSessionAutoTitle(id) {
            const historyData = savedSessions[id];
            if (!historyData) return 'New chat';
            const userFirstMsg = historyData.find(m => m.role === 'user');
            if (!userFirstMsg) return 'New chat';
            let summaryTitle = typeof userFirstMsg.content === 'string' ? userFirstMsg.content : (userFirstMsg.content[0]?.text || 'New chat');
            if (summaryTitle.startsWith('[Image Request]: ')) summaryTitle = summaryTitle.replace('[Image Request]: ', '🎨 ');
            return summaryTitle;
        }

        function getSessionDisplayTitle(id) {
            const custom = sessionTitles[id];
            let title = custom ? custom : getSessionAutoTitle(id);
            if (title.length > 24) title = title.substring(0, 22) + '...';
            return title;
        }

        function buildHistoryItem(id) {
            const isPinned = pinnedSessionIds.includes(id);
            const item = document.createElement('div');
            item.className = `history-item ${id === currentSessionId ? 'active' : ''}`;
            item.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <span class="history-item-title">${escapeHtml(getSessionDisplayTitle(id))}</span>
                <div class="history-item-actions">
                    <button type="button" class="hist-action-btn ${isPinned ? 'pinned' : ''}" data-action="pin" title="${isPinned ? 'Unpin chat' : 'Pin chat'}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79L15 12V7a2 2 0 0 0 2-2V4H7v1a2 2 0 0 0 2 2v5l-2.89 1.45A2 2 0 0 0 5 15.24z"></path></svg>
                    </button>
                    <button type="button" class="hist-action-btn" data-action="rename" title="Rename chat">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"></path></svg>
                    </button>
                    <button type="button" class="hist-action-btn danger" data-action="delete" title="Delete chat">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            item.onclick = () => loadSavedChatSession(id);
            item.querySelector('[data-action="pin"]').onclick = (e) => toggleChatPin(e, id);
            item.querySelector('[data-action="rename"]').onclick = (e) => renameChatSession(e, id);
            item.querySelector('[data-action="delete"]').onclick = (e) => deleteChatSession(e, id);
            return item;
        }

        function renderHistorySidebarList() {
            historyListTarget.innerHTML = '';
            const searchInput = document.getElementById('history-search-input');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

            const sortedIds = Object.keys(savedSessions).sort((a, b) => b.split('_')[1] - a.split('_')[1]);

            const matchesQuery = (id) => {
                const historyData = savedSessions[id];
                if (!query) return true;
                if (getSessionDisplayTitle(id).toLowerCase().includes(query)) return true;
                return historyData.some(m => {
                    if (typeof m.content === 'string') {
                        return m.content.toLowerCase().includes(query);
                    }
                    if (Array.isArray(m.content)) {
                        return m.content.some(item => item.text && item.text.toLowerCase().includes(query));
                    }
                    return false;
                });
            };

            const validIds = sortedIds.filter(id => savedSessions[id].some(m => m.role === 'user') && matchesQuery(id));
            const pinnedIds = validIds.filter(id => pinnedSessionIds.includes(id));
            const unpinnedIds = validIds.filter(id => !pinnedSessionIds.includes(id));

            if (pinnedIds.length > 0) {
                const label = document.createElement('div');
                label.className = 'history-label';
                label.style.marginTop = '0';
                label.textContent = 'Pinned';
                historyListTarget.appendChild(label);
                pinnedIds.forEach(id => historyListTarget.appendChild(buildHistoryItem(id)));

                const label2 = document.createElement('div');
                label2.className = 'history-label';
                label2.textContent = 'Recent';
                historyListTarget.appendChild(label2);
            }

            unpinnedIds.forEach(id => historyListTarget.appendChild(buildHistoryItem(id)));

            if (validIds.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'history-empty';
                if (query) {
                    empty.innerHTML = `
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <span>No matching chats found.</span>`;
                } else {
                    empty.innerHTML = `
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        <span>No conversations yet.<br>Start a new chat to see it here.</span>`;
                }
                historyListTarget.appendChild(empty);
            }
        }

        function toggleChatPin(event, id) {
            event.stopPropagation();
            const idx = pinnedSessionIds.indexOf(id);
            if (idx >= 0) pinnedSessionIds.splice(idx, 1);
            else pinnedSessionIds.push(id);
            safeSetLocalStorage('aqavox_pinned_sessions', JSON.stringify(pinnedSessionIds));
            renderHistorySidebarList();
        }

        function renameChatSession(event, id) {
            event.stopPropagation();
            const current = sessionTitles[id] || getSessionAutoTitle(id);
            const next = window.prompt('Rename chat', current);
            if (next === null) return;
            const trimmed = next.trim();
            if (!trimmed) return;
            sessionTitles[id] = trimmed;
            safeSetLocalStorage('aqavox_session_titles', JSON.stringify(sessionTitles));
            renderHistorySidebarList();
        }

        function deleteChatSession(event, id) {
            event.stopPropagation();
            if (!window.confirm('Delete this chat? This cannot be undone.')) return;

            delete savedSessions[id];
            delete sessionTitles[id];
            pinnedSessionIds = pinnedSessionIds.filter(pid => pid !== id);

            safeSetLocalStorage('aqavox_session_titles', JSON.stringify(sessionTitles));
            safeSetLocalStorage('aqavox_pinned_sessions', JSON.stringify(pinnedSessionIds));
            safeSetLocalStorage('aqavox_sessions', JSON.stringify(savedSessions));

            if (id === currentSessionId) {
                const remainingIds = Object.keys(savedSessions).sort((a, b) => b.split('_')[1] - a.split('_')[1]);
                if (remainingIds.length > 0) {
                    loadSavedChatSession(remainingIds[0]);
                } else {
                    startNewChat();
                }
            } else {
                renderHistorySidebarList();
            }
            updateVaultGrid();
        }

        function editUserMessage(index) {
            const msg = conversationHistory[index];
            if (!msg || msg.role !== 'user') return;

            const textToEdit = typeof msg.content === 'string' ? msg.content : (msg.content[0]?.text || '');
            const priorAttachments = msg.attachments ? JSON.parse(JSON.stringify(msg.attachments)) : [];

            // Drop this message and everything after it — it'll be resent (regenerated) once the user submits the edit.
            conversationHistory = conversationHistory.slice(0, index);

            const startRow = chatFeedInner.querySelector(`[data-history-index="${index}"]`);
            if (startRow) {
                let row = startRow;
                while (row) {
                    const next = row.nextElementSibling;
                    row.remove();
                    row = next;
                }
            }

            uploadedFiles = priorAttachments;
            renderFilePreviews();

            promptInput.value = textToEdit;
            adjustTextareaHeight();
            promptInput.focus();

            saveHistoryToStorage();
            renderHistorySidebarList();
            toggleArtifactsPane(false);
        }

        function switchSidebarTab(targetTab) {
            const panelDisplay = { chats: 'flex', config: 'flex', vault: 'block' };
            ['chats', 'config', 'vault'].forEach(t => {
                const tabBtn = document.getElementById('tab-' + t);
                const bottomBtn = document.getElementById('bottom-' + t);
                const panel = document.getElementById('panel-' + t);
                if (tabBtn) tabBtn.classList.toggle('active', t === targetTab);
                if (bottomBtn) bottomBtn.classList.toggle('active', t === targetTab);
                if (panel) panel.style.display = (t === targetTab) ? panelDisplay[t] : 'none';
            });
        }

        function updateVaultGrid() {
            vaultGridTarget.innerHTML = '';
            Object.values(savedSessions).forEach(sessionData => {
                sessionData.forEach(m => {
                    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('__IMAGE_BLOB__')) {
                        const parts = m.content.split('__IMAGE_BLOB__:');
                        const imgMeta = parts[1] ? parts[1].split('|') : parts[0].replace('__IMAGE_BLOB__:', '').split('|');
                        const promptText = imgMeta[0];
                        const sourceUrl = imgMeta[1];

                        if(sourceUrl) {
                            const item = document.createElement('div');
                            item.className = 'vault-item';
                            item.title = promptText;
                            item.innerHTML = `<img src="${sourceUrl}" alt="Vault Graphic Asset" loading="lazy" decoding="async">`;
                            item.onclick = () => {
                                toggleVisionMode(false);
                                promptInput.value = `Regarding your previous creation "${promptText}", let's modify it by `;
                                adjustTextareaHeight();
                                if (window.innerWidth <= 768) document.body.classList.add('sidebar-hidden');
                                promptInput.focus();
                            };
                            vaultGridTarget.appendChild(item);
                        }
                    }
                });
            });
        }

        function applyTuningModifier(pillElement, basePrompt, adjustmentKeyword) {
            toggleVisionMode(false);
            promptInput.value = `Update the image of "${basePrompt}" to make it look like a ${adjustmentKeyword}`;
            adjustTextareaHeight();
            runConversationTurn();
        }

        function toggleVisionMode(activateVision) {
            isVisionModeActive = activateVision;
            const menuImageMode = document.getElementById('menu-image-mode');
            if (menuImageMode) {
                menuImageMode.classList.toggle('active', isVisionModeActive);
            }
            if (isVisionModeActive) {
                inputContainer.classList.add('vision-active');
                promptInput.placeholder = "Describe the image to create...";
            } else {
                inputContainer.classList.remove('vision-active');
                promptInput.placeholder = "Type a message or ask to tweak an image...";
            }
            adjustTextareaHeight();
            promptInput.focus();
        }

        function clearAllDataCache() {
            localStorage.clear();
            location.reload();
        }

        async function triggerImageGeneration(promptText, renderingContainer) {
            const width = parseInt(widthInput.value) || 1024;
            const height = parseInt(heightInput.value) || 1024;
            const model = modelSelect.value;
            const seed = seedInput.value.trim();

            const params = new URLSearchParams({
                width: width, height: height, model: model,
                nologo: 'true', private: 'true', enhance: 'false'
            });
            if (seed) params.append('seed', seed);

            const targetImageUrl = `${IMAGE_API_BASE}/${encodeURIComponent(promptText)}?${params.toString()}`;

            try {
                const response = await fetchWithRetry(targetImageUrl);
                if (!response.ok) throw new Error("API streaming pipeline handling breakdown.");
                const blobData = await response.blob();
                const localUrl = URL.createObjectURL(blobData);

                renderingContainer.embedImageCard(localUrl, targetImageUrl, promptText);
                return targetImageUrl;
            } catch (err) {
                renderingContainer.appendError(`Render pipeline error: ${err.message}. ${!navigator.onLine ? 'You appear to be offline.' : 'Please try again.'}`);
                return null;
            }
        }

        async function fetchWithRetry(url, options = {}, retries = 3, delay = 500) {
            try {
                const response = await fetch(url, options);
                if (!response.ok && (response.status === 429 || response.status >= 500) && retries > 0) {
                    console.warn(`Fetch failed with status ${response.status}. Retrying in ${delay}ms... (${retries} left)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithRetry(url, options, retries - 1, delay * 2);
                }
                return response;
            } catch (error) {
                if (retries > 0) {
                    console.warn(`Fetch network error: ${error.message}. Retrying in ${delay}ms... (${retries} left)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithRetry(url, options, retries - 1, delay * 2);
                }
                throw error;
            }
        }

        async function runConversationTurn() {
            let rawInput = promptInput.value.trim();
            if (!rawInput && uploadedFiles.length === 0) return;

            const isInitialMessage = (conversationHistory.length === 1);
            if (welcomeHero) welcomeHero.remove();

            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

            const hasImagesInTurn = uploadedFiles.some(f => f.type === 'image');
            if (hasImagesInTurn && !apiKey) {
                appendUserMessage(rawInput, uploadedFiles);
                
                uploadedFiles = [];
                renderFilePreviews();
                promptInput.value = '';
                adjustTextareaHeight();
                
                appendSystemWarning(
                    "<strong>Vision capabilities (image uploads) require a Pollinations API Key.</strong><br><br>" +
                    "To fix this:<br>" +
                    "1. Get a <strong>free API Key</strong> by signing up at <a href='https://enter.pollinations.ai' target='_blank' style='color:var(--y-accent); text-decoration:underline;'>enter.pollinations.ai</a> (you will instantly receive free pollen/credits).<br>" +
                    "2. Paste your key into the <strong>Pollinations API Key</strong> input field in the sidebar Settings panel.<br>" +
                    "3. Try uploading the image again."
                );
                return;
            }

            let targetModel = chatModelSelect.value;
            if (isWebSearchActive) {
                if (!apiKey) {
                    appendUserMessage(rawInput, uploadedFiles);
                    uploadedFiles = [];
                    renderFilePreviews();
                    promptInput.value = '';
                    adjustTextareaHeight();
                    
                    appendSystemWarning(
                        "<strong>Real-time Web Search grounding requires a Pollinations API Key.</strong><br><br>" +
                        "To fix this:<br>" +
                        "1. Get a <strong>free API Key</strong> by signing up at <a href='https://enter.pollinations.ai' target='_blank' style='color:var(--y-accent); text-decoration:underline;'>enter.pollinations.ai</a>.<br>" +
                        "2. Paste your key into the settings sidebar panel.<br>" +
                        "3. Turn on web search toggle again."
                    );
                    return;
                }
                targetModel = 'gemini-search';
            }

            appendUserMessage(rawInput, uploadedFiles, conversationHistory.length);

            conversationHistory.push({
                role: "user",
                content: rawInput,
                attachments: [...uploadedFiles]
            });

            uploadedFiles = [];
            renderFilePreviews();

            promptInput.value = '';
            adjustTextareaHeight();
            submitBtn.disabled = true;

            if (isVisionModeActive) {
                const { updateContent, embedImageCard, appendError } = createAgentResponseStream(true);
                scrollToBottom();
                updateContent(`Rendering vision target request...`);
                
                const imgUrl = await triggerImageGeneration(rawInput, { embedImageCard, appendError });
                if (imgUrl) {
                    conversationHistory[conversationHistory.length - 1].content = `[Image Request]: ${rawInput}`;
                    conversationHistory.push({ role: "assistant", content: `__IMAGE_BLOB__:${rawInput}|${imgUrl}` });
                    saveHistoryToStorage();
                    renderHistorySidebarList();
                }
                
                toggleVisionMode(false);
                submitBtn.disabled = false;
                scrollToBottom();
                return;
            }

            const { updateContent, removeLoading, embedImageCard, appendError } = createAgentResponseStream(false);
            scrollToBottom();

            if (isInitialMessage) renderHistorySidebarList(); 

            let fullAiResponse = "";
            let reasoningText = "";

            try {
                const mappedMessages = conversationHistory.map(m => {
                    if (typeof m.content === 'string' && m.content.startsWith('__IMAGE_BLOB__')) {
                        const splitData = m.content.replace('__IMAGE_BLOB__:', '').split('|');
                        return { role: "assistant", content: `[System Info: An image was generated previously matching this description: "${splitData[0]}"]` };
                    }
                    if (m.role === 'user') {
                        let compiledText = "";
                        let hasImages = false;
                        let images = [];
                        
                        if (m.attachments) {
                            m.attachments.forEach(att => {
                                if (att.type === 'text') {
                                    compiledText += `[Content of uploaded file "${att.name}":]\n\`\`\`\n${att.content}\n\`\`\`\n\n`;
                                } else if (att.type === 'image') {
                                    hasImages = true;
                                    images.push(att.dataUrl);
                                }
                            });
                        }
                        compiledText += (typeof m.content === 'string' ? m.content : '');

                        if (hasImages) {
                            const contentArray = [{ type: "text", text: compiledText }];
                            images.forEach(imgUrl => {
                                contentArray.push({ type: "image_url", image_url: { url: imgUrl } });
                            });
                            return { role: "user", content: contentArray };
                        } else {
                            return { role: "user", content: compiledText };
                        }
                    }
                    return m;
                });

                const fetchUrl = apiKey ? "https://gen.pollinations.ai/v1/chat/completions" : TEXT_API_BASE;
                const headers = { "Content-Type": "application/json" };
                if (apiKey) {
                    headers["Authorization"] = `Bearer ${apiKey}`;
                }

                const response = await fetchWithRetry(fetchUrl, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({
                        messages: mappedMessages,
                        model: targetModel,
                        stream: true
                    })
                });

                if (!response.ok) throw new Error("Text processing pipeline anomaly.");
                
                removeLoading();

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let streamBuffer = "";
                let lastRenderTime = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    streamBuffer += decoder.decode(value, { stream: true });
                    const lines = streamBuffer.split("\n");
                    streamBuffer = lines.pop();

                    for (const line of lines) {
                        const cleanedLine = line.trim();
                        if (!cleanedLine) continue;
                        if (cleanedLine.startsWith("data: ")) {
                            const dataStr = cleanedLine.slice(6);
                            if (dataStr === "[DONE]") break;
                            try {
                                const parsed = JSON.parse(dataStr);
                                const delta = parsed.choices[0]?.delta;
                                if (!delta) continue;

                                const content = delta.content || "";
                                const reasoning = delta.reasoning || "";

                                if (reasoning) reasoningText += reasoning;
                                if (content) fullAiResponse += content;

                                const now = Date.now();
                                if (now - lastRenderTime >= 60) {
                                    updateContent(fullAiResponse, reasoningText);
                                    scrollToBottom();
                                    lastRenderTime = now;
                                }
                            } catch (err) {}
                        }
                    }
                }

                if (streamBuffer.trim().startsWith("data: ")) {
                    try {
                        const dataStr = streamBuffer.trim().slice(6);
                        if (dataStr !== "[DONE]") {
                            const parsed = JSON.parse(dataStr);
                            const delta = parsed.choices[0]?.delta;
                            if (delta) {
                                const content = delta.content || "";
                                const reasoning = delta.reasoning || "";
                                if (reasoning) reasoningText += reasoning;
                                if (content) fullAiResponse += content;
                            }
                        }
                    } catch(e) {}
                }

                updateContent(fullAiResponse, reasoningText);
                scrollToBottom();

                appendTurnActionControls(chatFeedInner.lastChild, fullAiResponse);

                const triggerRegex = /\[GENERATE_IMAGE:\s*(.*?)\]/i;
                const match = fullAiResponse.match(triggerRegex);

                if (match) {
                    const parsedImagePrompt = match[1].trim();
                    let cleanDisplayMarkdown = fullAiResponse.replace(triggerRegex, '').trim();
                    
                    updateContent(cleanDisplayMarkdown, reasoningText);
                    
                    const shimmerPlaceholder = document.createElement('div');
                    shimmerPlaceholder.className = 'shimmer-placeholder';
                    chatFeedInner.lastChild.appendChild(shimmerPlaceholder);
                    scrollToBottom();

                    const imgUrl = await triggerImageGeneration(parsedImagePrompt, { 
                        embedImageCard: (disp, src, alt) => {
                            shimmerPlaceholder.remove();
                            embedImageCard(disp, src, alt);
                        }, 
                        appendError: (err) => {
                            shimmerPlaceholder.remove();
                            appendError(err);
                        } 
                    });

                    if (imgUrl) {
                        conversationHistory.push({ role: "assistant", content: (reasoningText ? `[Thinking: ${reasoningText}]\n\n` : '') + cleanDisplayMarkdown + `\n\n__IMAGE_BLOB__:${parsedImagePrompt}|${imgUrl}` });
                    }
                } else {
                    conversationHistory.push({ role: "assistant", content: (reasoningText ? `[Thinking: ${reasoningText}]\n\n` : '') + fullAiResponse });
                }
                
                findAndRenderArtifacts(fullAiResponse);
                saveHistoryToStorage();
            } catch (err) {
                appendError(`Context tracking thread lost. Detail: ${err.message}`);
            } finally {
                submitBtn.disabled = false;
                scrollToBottom();
            }
        }

        function appendUserMessage(text, attachments, historyIndex) {
            const msgRow = document.createElement('div');
            msgRow.className = 'message user';
            if (historyIndex !== undefined) msgRow.dataset.historyIndex = historyIndex;

            let filesHtml = "";
            if (attachments && attachments.length > 0) {
                attachments.forEach(f => {
                    if (f.type === 'image') {
                        filesHtml += `<div class="media-card" style="margin-bottom:8px;"><img src="${f.dataUrl}" style="max-height: 180px; border-radius: 8px;"></div>`;
                    } else if (f.type === 'text') {
                        filesHtml += `<div style="background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; font-size:13px; color: var(--text-sub); margin-bottom:8px; display:inline-flex; align-items:center; gap:8px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                            <span>${escapeHtml(f.name)} (${Math.round(f.size / 1024)} KB)</span>
                        </div><br>`;
                    }
                });
            }

            const editBtnHtml = historyIndex !== undefined ? `
                <div class="message-actions" style="justify-content: flex-end;">
                    <button class="action-btn" onclick="editUserMessage(${historyIndex})" title="Edit and regenerate">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"></path></svg> Edit
                    </button>
                </div>` : '';

            msgRow.innerHTML = `<div class="bubble">${filesHtml}${escapeHtml(text)}</div>${editBtnHtml}`;
            chatFeedInner.appendChild(msgRow);
        }

        function appendSystemWarning(messageText) {
            const msgRow = document.createElement('div');
            msgRow.className = 'message model';
            msgRow.innerHTML = `
                <div class="avatar" style="color: #ffb300; background: rgba(255, 179, 0, 0.1);">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                </div>
                <div class="text-content" style="color: #ffb300; line-height: 1.4;">
                    ${messageText}
                </div>
            `;
            chatFeedInner.appendChild(msgRow);
            scrollToBottom();
        }

        function createAgentResponseStream(isImageLoading) {
            const msgRow = document.createElement('div');
            msgRow.className = 'message model';
            
            let loadingHtml = isImageLoading ? 
                `<div class="shimmer-placeholder"></div>` : 
                `<div class="text-shimmer-container">
                    <div class="text-shimmer-bar" style="width: 80%;"></div>
                    <div class="text-shimmer-bar" style="width: 90%;"></div>
                    <div class="text-shimmer-bar" style="width: 55%;"></div>
                 </div>`;

            msgRow.innerHTML = `
                <div class="avatar">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L14.76 8.76L21.52 11.52L14.76 14.28L12 21.04L9.24 14.28L2.48 11.52L9.24 8.76L12 2Z"/>
                    </svg>
                </div>
                <div class="text-content"></div>
                ${loadingHtml}
            `;
            
            chatFeedInner.appendChild(msgRow);
            const textContentNode = msgRow.querySelector('.text-content');
            const loaderNode = isImageLoading ? msgRow.querySelector('.shimmer-placeholder') : msgRow.querySelector('.text-shimmer-container');

            return {
                updateContent: (txt, reasoning) => {
                    let html = "";
                    if (reasoning) {
                        html += `<div class="ai-reasoning"><strong>Thinking...</strong><br>${escapeHtml(reasoning)}</div>`;
                    }
                    if (txt) {
                        html += marked.parse(txt);
                    }
                    textContentNode.innerHTML = sanitizeHtml(html);
                    addCopyButtonsToCodeBlocks(textContentNode);
                },
                removeLoading: () => { if (loaderNode) loaderNode.remove(); },
                embedImageCard: (displayUrl, sourceUrl, altText) => {
                    if (loaderNode) loaderNode.remove();
                    const card = document.createElement('div');
                    card.className = 'media-card';
                    
                    const sanitizedAlt = escapeHtml(altText);
                    card.innerHTML = `
                        <img src="${displayUrl}" alt="${sanitizedAlt}">
                        <div class="card-actions">
                            <a class="btn" href="${displayUrl}" download="${sanitizedAlt.substring(0,12).replace(/[^a-z0-9]/gi, '_')}.jpg">Download</a>
                            <a class="btn" href="${sourceUrl}" target="_blank">Web Link</a>
                        </div>
                        <div class="macro-tuning-row">
                            <div class="tuning-pill" onclick="applyTuningModifier(this, '${sanitizedAlt.replace(/'/g, "\\'")}', 'photorealistic photography 8k resolution cinematic lighting')">📷 Photorealistic</div>
                            <div class="tuning-pill" onclick="applyTuningModifier(this, '${sanitizedAlt.replace(/'/g, "\\'")}', 'detailed anime illustration vector art style')">🎨 Anime Style</div>
                            <div class="tuning-pill" onclick="applyTuningModifier(this, '${sanitizedAlt.replace(/'/g, "\\'")}', 'cyberpunk neon glowing color palette aesthetic')">🌆 Cyberpunk</div>
                            <div class="tuning-pill" onclick="applyTuningModifier(this, '${sanitizedAlt.replace(/'/g, "\\'")}', 'pencil sketch hand drawn monochrome fine lines art')">✏️ Sketch</div>
                        </div>
                    `;
                    msgRow.appendChild(card);
                    card.querySelector('img').onload = scrollToBottom;
                },
                appendError: (errMsg) => {
                    if (loaderNode) loaderNode.remove();
                    textContentNode.style.color = '#ff6b6b';
                    textContentNode.textContent = errMsg;
                }
            };
        }

        function rebuildFeedFromHistory() {
            chatFeedInner.innerHTML = '';
            conversationHistory.forEach((msg, idx) => {
                if (msg.role === 'system') return;
                if (msg.role === 'user') {
                    appendUserMessage(msg.content, msg.attachments, idx);
                } else if (msg.role === 'assistant') {
                    const containsImage = typeof msg.content === 'string' && msg.content.includes('__IMAGE_BLOB__:');
                    
                    if (containsImage) {
                        const parts = msg.content.split('\n\n__IMAGE_BLOB__:');
                        const textPart = parts[0];
                        const imgMeta = parts[1] ? parts[1].split('|') : parts[0].replace('__IMAGE_BLOB__:', '').split('|');
                        
                        const promptAlt = imgMeta[0];
                        const webSourceUrl = imgMeta[1];

                        const { updateContent, removeLoading, embedImageCard } = createAgentResponseStream(false);
                        removeLoading();
                        
                        let cleanText = textPart;
                        let reasoning = "";
                        const reasoningRegex = /^\[Thinking:\s*([\s\S]*?)\]\n\n/;
                        const reasoningMatch = cleanText.match(reasoningRegex);
                        if (reasoningMatch) {
                            reasoning = reasoningMatch[1];
                            cleanText = cleanText.replace(reasoningRegex, '');
                        }

                        if(!cleanText.startsWith('__IMAGE_BLOB__:')) {
                            updateContent(cleanText, reasoning);
                        } else {
                            updateContent(`Render pipeline lookup for "${promptAlt}":`, reasoning);
                        }
                        embedImageCard(webSourceUrl, webSourceUrl, promptAlt);
                    } else {
                        const { updateContent, removeLoading } = createAgentResponseStream(false);
                        removeLoading();
                        
                        let cleanText = msg.content;
                        let reasoning = "";
                        const reasoningRegex = /^\[Thinking:\s*([\s\S]*?)\]\n\n/;
                        const reasoningMatch = cleanText.match(reasoningRegex);
                        if (reasoningMatch) {
                            reasoning = reasoningMatch[1];
                            cleanText = cleanText.replace(reasoningRegex, '');
                        }

                        updateContent(cleanText, reasoning);
                        appendTurnActionControls(chatFeedInner.lastChild, cleanText);
                    }
                }
            });

            // Automatically open live preview for the last assistant message if it contains HTML/SVG code
            const lastAssistantMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant');
            if (lastAssistantMsg) {
                findAndRenderArtifacts(lastAssistantMsg.content);
            } else {
                toggleArtifactsPane(false);
            }

            setTimeout(scrollToBottom, 200);
        }

        function scrollToBottom() { chatFeed.scrollTop = chatFeed.scrollHeight; }
        function escapeHtml(str) { return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

        // Sanitizes AI-rendered markdown HTML to prevent XSS from model output or prompt-injected content.
        function sanitizeHtml(html) {
            if (typeof DOMPurify !== 'undefined') {
                return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
            }
            console.warn('DOMPurify unavailable — falling back to escaped plain text.');
            return escapeHtml(html);
        }

        // --- Premium Custom Optimizations (Templates, Search, Exports, Artifacts) ---
        let activeArtifactContent = "";

        function applyTemplatePrompt(type) {
            let promptText = "";
            switch (type) {
                case 'dev':
                    promptText = "Act as an expert software engineer. Help me write a robust, clean, and optimized algorithm in JavaScript for: ";
                    break;
                case 'design':
                    promptText = "Act as a creative UI designer. Critique my website structure or help me write a clean modern SVG vector illustration for: ";
                    break;
                case 'analyst':
                    promptText = "Act as a senior data analyst. Formulate a structured plan to analyze user metric tables and retention behavior for: ";
                    break;
                case 'copy':
                    promptText = "Act as a professional copywriter. Write a highly persuasive, visually appealing landing page copy or article about: ";
                    break;
            }
            promptInput.value = promptText;
            adjustTextareaHeight();
            promptInput.focus();
        }

        function filterChatsList() {
            const query = document.getElementById('history-search-input').value.toLowerCase().trim();
            const items = historyListTarget.getElementsByClassName('history-item');
            let matchedAny = false;

            Array.from(items).forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(query)) {
                    item.style.display = 'flex';
                    matchedAny = true;
                } else {
                    item.style.display = 'none';
                }
            });

            let placeholder = document.getElementById('search-empty-state');
            if (!matchedAny && query !== "") {
                if (!placeholder) {
                    placeholder = document.createElement('div');
                    placeholder.id = 'search-empty-state';
                    placeholder.style.cssText = 'font-size: 11px; color: var(--text-sub); padding: 12px; text-align: center;';
                    placeholder.textContent = 'No matching chats found';
                    historyListTarget.appendChild(placeholder);
                }
            } else {
                if (placeholder) placeholder.remove();
            }
        }

        function exportChatSession(format) {
            if (conversationHistory.length <= 1) {
                alert("Nothing to export yet. Start a conversation first!");
                return;
            }

            const titleVal = conversationHistory.find(m => m.role === 'user')?.content || 'Aqavox_Chat_Session';
            const cleanTitle = (typeof titleVal === 'string' ? titleVal : (titleVal[0]?.text || 'Chat')).replace(/[^a-z0-9]/gi, '_').substring(0, 30);

            if (format === 'json') {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(conversationHistory, null, 2));
                const dlAnchorElem = document.createElement('a');
                dlAnchorElem.setAttribute("href", dataStr);
                dlAnchorElem.setAttribute("download", `${cleanTitle}.json`);
                dlAnchorElem.click();
            } else if (format === 'md') {
                let mdContent = `# Aqavox Conversation: ${cleanTitle.replace(/_/g, ' ')}\n\n`;
                conversationHistory.forEach(msg => {
                    if (msg.role === 'system') return;
                    const roleTitle = msg.role === 'user' ? '### 👤 User' : '### 🤖 Assistant';
                    mdContent += `${roleTitle}\n\n`;
                    if (typeof msg.content === 'string') {
                        mdContent += `${msg.content}\n\n`;
                    } else if (Array.isArray(msg.content)) {
                        msg.content.forEach(c => {
                            if (c.type === 'text') mdContent += `${c.text}\n\n`;
                            else if (c.type === 'image_url') mdContent += `![User Attachment Image](${c.image_url.url})\n\n`;
                        });
                    }
                });
                const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const dlAnchorElem = document.createElement('a');
                dlAnchorElem.setAttribute("href", url);
                dlAnchorElem.setAttribute("download", `${cleanTitle}.md`);
                dlAnchorElem.click();
                URL.revokeObjectURL(url);
            } else if (format === 'pdf') {
                window.print();
            }
        }

        function findAndRenderArtifacts(text) {
            if (!text || typeof text !== 'string') return;
            const htmlRegex = /```(html|xml|svg)\s*([\s\S]*?)```/i;
            const match = text.match(htmlRegex);

            if (match) {
                const type = match[1].toLowerCase();
                const code = match[2];
                activeArtifactContent = code;

                toggleArtifactsPane(true);
                document.getElementById('artifacts-filename').textContent = type === 'html' ? 'Live HTML Preview' : 'SVG Asset Preview';
                
                const iframe = document.getElementById('artifacts-iframe');
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                if (type === 'html') {
                    doc.write(code);
                } else {
                    doc.write(`<html><body style="margin:0; display:flex; align-items:center; justify-content:center; height:100vh; background:#0f1011;">${code}</body></html>`);
                }
                doc.close();
            }
        }

        function toggleArtifactsPane(show) {
            const pane = document.getElementById('artifacts-pane');
            if (pane) {
                pane.style.display = show ? 'flex' : 'none';
                setTimeout(scrollToBottom, 100);
            }
        }
        
        function copyArtifactCode() {
            if (activeArtifactContent) {
                navigator.clipboard.writeText(activeArtifactContent).then(() => {
                    const btn = document.querySelector('.artifacts-actions button');
                    const oldText = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(() => btn.textContent = oldText, 2000);
                });
            }
        }

        window.applyTemplatePrompt = applyTemplatePrompt;
        window.filterChatsList = filterChatsList;
        window.exportChatSession = exportChatSession;
        window.findAndRenderArtifacts = findAndRenderArtifacts;
        window.toggleArtifactsPane = toggleArtifactsPane;
        window.copyArtifactCode = copyArtifactCode;

        function addCopyButtonsToCodeBlocks(container) {
            container.querySelectorAll('pre').forEach(pre => {
                if (pre.querySelector('.code-header-bar')) return;

                let wrapper = pre.parentElement;
                if (!wrapper.classList.contains('code-block-wrapper')) {
                    wrapper = document.createElement('div');
                    wrapper.className = 'code-block-wrapper';
                    pre.parentNode.insertBefore(wrapper, pre);
                    wrapper.appendChild(pre);
                }

                const codeEl = pre.querySelector('code');
                let lang = 'code';
                if (codeEl) {
                    const classes = Array.from(codeEl.classList);
                    const langClass = classes.find(c => c.startsWith('language-'));
                    if (langClass) {
                        lang = langClass.replace('language-', '');
                    }
                    if (window.hljs) {
                        try {
                            hljs.highlightElement(codeEl);
                        } catch (e) {
                            console.error("Syntax highlighting error:", e);
                        }
                    }
                }

                const header = document.createElement('div');
                header.className = 'code-header-bar';
                
                const langLabel = document.createElement('span');
                langLabel.className = 'code-lang-label';
                langLabel.textContent = lang.toUpperCase();
                
                const copyBtn = document.createElement('button');
                copyBtn.className = 'code-copy-btn';
                copyBtn.textContent = 'Copy';
                copyBtn.onclick = () => {
                    const rawCode = codeEl ? codeEl.textContent : pre.textContent;
                    navigator.clipboard.writeText(rawCode).then(() => {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy';
                        }, 2000);
                    });
                };

                header.appendChild(langLabel);

                if (lang === 'html' || lang === 'svg' || lang === 'xml') {
                    const previewBtn = document.createElement('button');
                    previewBtn.className = 'code-copy-btn';
                    previewBtn.textContent = 'Show Preview';
                    previewBtn.style.marginRight = '8px';
                    previewBtn.onclick = () => {
                        const rawCode = codeEl ? codeEl.textContent : pre.textContent;
                        activeArtifactContent = rawCode;
                        
                        toggleArtifactsPane(true);
                        document.getElementById('artifacts-filename').textContent = lang === 'html' ? 'Live HTML Preview' : 'SVG Asset Preview';
                        
                        const iframe = document.getElementById('artifacts-iframe');
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        doc.open();
                        if (lang === 'html') {
                            doc.write(rawCode);
                        } else {
                            doc.write(`<html><body style="margin:0; display:flex; align-items:center; justify-content:center; height:100vh; background:#0f1011;">${rawCode}</body></html>`);
                        }
                        doc.close();
                    };
                    header.appendChild(previewBtn);
                }

                header.appendChild(copyBtn);
                wrapper.insertBefore(header, pre);
            });
        }

        function adjustTextareaHeight() {
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
        }

        function triggerFileUpload() {
            document.getElementById('file-upload-input').click();
        }

        function handleFileSelect(e) {
            if (e.target.files) {
                handleUploadedFiles(e.target.files);
            }
            e.target.value = '';
        }

        function handleUploadedFiles(files) {
            Array.from(files).forEach(file => {
                if (uploadedFiles.length >= 5) {
                    alert("Maximum 5 file attachments allowed per request.");
                    return;
                }

                if (file.type.startsWith('image/')) {
                    compressImage(file, (compressedDataUrl) => {
                        uploadedFiles.push({
                            type: 'image',
                            name: file.name,
                            size: file.size,
                            dataUrl: compressedDataUrl
                        });
                        renderFilePreviews();
                    });
                } else {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        uploadedFiles.push({
                            type: 'text',
                            name: file.name,
                            size: file.size,
                            content: event.target.result
                        });
                        renderFilePreviews();
                    };
                    reader.readAsText(file);
                }
            });
        }

        function compressImage(file, callback) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const maxDim = 600;
                    let width = img.width;
                    let height = img.height;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height *= maxDim / width;
                            width = maxDim;
                        } else {
                            width *= maxDim / height;
                            height = maxDim;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    callback(dataUrl);
                };
            };
        }

        function renderFilePreviews() {
            const container = document.getElementById('file-preview-container');
            container.innerHTML = '';
            
            if (uploadedFiles.length === 0) {
                container.style.display = 'none';
                return;
            }
            
            container.style.display = 'flex';
            uploadedFiles.forEach((file, index) => {
                const item = document.createElement('div');
                item.className = 'file-preview-item';
                
                if (file.type === 'image') {
                    item.innerHTML = `
                        <img src="${file.dataUrl}">
                        <button class="remove-file-btn" onclick="removeUploadedFile(${index})">×</button>
                    `;
                } else {
                    let shortName = file.name;
                    if (shortName.length > 10) shortName = shortName.substring(0, 7) + '...' + shortName.split('.').pop();
                    item.innerHTML = `
                        <div class="file-icon-placeholder">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                            <span>${escapeHtml(shortName)}</span>
                        </div>
                        <button class="remove-file-btn" onclick="removeUploadedFile(${index})">×</button>
                    `;
                }
                container.appendChild(item);
            });
        }

        window.removeUploadedFile = function(index) {
            uploadedFiles.splice(index, 1);
            renderFilePreviews();
        };

        window.triggerFileUpload = triggerFileUpload;
        window.handleFileSelect = handleFileSelect;

        const pBox = document.getElementById('input-container');
        pBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            pBox.style.borderColor = 'var(--y-accent)';
        });
        pBox.addEventListener('dragleave', (e) => {
            e.preventDefault();
            pBox.style.borderColor = isVisionModeActive ? '#9b51e0' : 'var(--border-color)';
        });
        pBox.addEventListener('drop', (e) => {
            e.preventDefault();
            pBox.style.borderColor = isVisionModeActive ? '#9b51e0' : 'var(--border-color)';
            if (e.dataTransfer.files) {
                handleUploadedFiles(e.dataTransfer.files);
            }
        });

        function toggleVoiceInput() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert("Speech Recognition API is not supported in this browser. Please use Chrome or Edge.");
                return;
            }

            if (!speechRecognition) {
                speechRecognition = new SpeechRecognition();
                speechRecognition.continuous = true;
                speechRecognition.interimResults = true;
                speechRecognition.lang = 'en-US';

                speechRecognition.onstart = () => {
                    isListening = true;
                    document.getElementById('mic-btn').classList.add('mic-active');
                    promptInput.placeholder = "Listening...";
                };

                speechRecognition.onresult = (event) => {
                    let interimTranscript = '';
                    let finalTranscript = '';

                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }

                    if (finalTranscript) {
                        promptInput.value = (promptInput.value + ' ' + finalTranscript).trim();
                        adjustTextareaHeight();
                    }
                };

                speechRecognition.onerror = (e) => {
                    console.error("Speech recognition error:", e);
                    stopListening();
                };

                speechRecognition.onend = () => {
                    stopListening();
                };
            }

            if (isListening) {
                speechRecognition.stop();
            } else {
                speechRecognition.start();
            }
        }

        function stopListening() {
            isListening = false;
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) micBtn.classList.remove('mic-active');
            promptInput.placeholder = isVisionModeActive ? "Describe the image to create..." : "Type a message or ask to tweak an image...";
        }

        window.toggleVoiceInput = toggleVoiceInput;

        function speakResponse(button, textToRead) {
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                if (currentUtterance && currentUtterance._btn === button) {
                    button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Speak`;
                    currentUtterance = null;
                    return;
                }
            }

            const cleanText = textToRead.replace(/\[GENERATE_IMAGE:.*?\]/gi, '')
                                        .replace(/`{3}[\s\S]*?`{3}/g, '[Code block skipped]')
                                        .replace(/[*#_`]/g, '');

            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance._btn = button;
            
            utterance.onend = () => {
                button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Speak`;
                currentUtterance = null;
            };

            button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Stop`;
            currentUtterance = utterance;
            window.speechSynthesis.speak(utterance);
        }

        function toggleWebSearch() {
            isWebSearchActive = !isWebSearchActive;
            const btn = document.getElementById('menu-web-search');
            if (btn) {
                btn.classList.toggle('active', isWebSearchActive);
            }
        }

        window.toggleWebSearch = toggleWebSearch;

        function modifyPreviousResponse(action) {
            let promptText = "";
            switch (action) {
                case 'shorter': promptText = "Make your previous response shorter and more concise."; break;
                case 'longer': promptText = "Expand your previous response with more details and explanation."; break;
                case 'simpler': promptText = "Rewrite your previous response using simpler language."; break;
                case 'professional': promptText = "Rewrite your previous response in a more professional and formal tone."; break;
            }
            promptInput.value = promptText;
            adjustTextareaHeight();
            runConversationTurn();
        }

        function appendTurnActionControls(msgRow, textContent) {
            if (msgRow.querySelector('.message-actions')) return; 
            
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'message-actions';
            
            const speakBtn = document.createElement('button');
            speakBtn.className = 'action-btn';
            speakBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Speak`;
            speakBtn.onclick = () => speakResponse(speakBtn, textContent);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn';
            copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(textContent).then(() => {
                    copyBtn.innerHTML = `Copied!`;
                    setTimeout(() => {
                        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
                    }, 2000);
                });
            };

            actionsContainer.appendChild(speakBtn);
            actionsContainer.appendChild(copyBtn);
            msgRow.appendChild(actionsContainer);

            if (textContent && !textContent.includes('__IMAGE_BLOB__')) {
                const tunersRow = document.createElement('div');
                tunersRow.className = 'response-tuners';
                
                const pills = [
                    { label: '📏 Shorter', action: 'shorter' },
                    { label: '📈 Longer', action: 'longer' },
                    { label: '🧠 Simpler', action: 'simpler' },
                    { label: '💼 Professional', action: 'professional' }
                ];
                
                pills.forEach(p => {
                    const pill = document.createElement('div');
                    pill.className = 'tuner-pill';
                    pill.textContent = p.label;
                    pill.onclick = () => modifyPreviousResponse(p.action);
                    tunersRow.appendChild(pill);
                });
                msgRow.appendChild(tunersRow);
            }
        }

        promptInput.addEventListener('input', adjustTextareaHeight);

        submitBtn.addEventListener('click', runConversationTurn);
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!submitBtn.disabled) runConversationTurn();
            }
        });

        // Register the app-shell service worker for offline/installable support (PWA).
        // Silently no-ops on browsers/contexts that don't support it (e.g. plain file:// access).
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').catch((err) => {
                    console.warn('Service worker registration skipped:', err.message);
                });
            });
        }
