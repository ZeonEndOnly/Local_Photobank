import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API = "http://localhost:3001/api";

function App() {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [page, setPage] = useState(token ? "gallery" : "login");

  // Upload state
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [folders, setFolders] = useState({ special: [], months: [] });
  const [selectedFolder, setSelectedFolder] = useState("");
  const [media, setMedia] = useState([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("uploaded_at");
  const [order, setOrder] = useState("DESC");
  const [diskUsage, setDiskUsage] = useState(0);
  const [modalMedia, setModalMedia] = useState(null);

  // Login/signup state
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [signupMode, setSignupMode] = useState(false);

  // Fetch folders, disk usage, and media
  useEffect(() => {
    if (!token) return;
    
    // Set up axios defaults
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    // Fetch folders
    axios
      .get(`${API}/folders`)
      .then((res) => setFolders(res.data))
      .catch((err) => {
        console.error("Error fetching folders:", err);
      });
    
    // Fetch disk usage
    axios
      .get(`${API}/disk-usage`)
      .then((res) => setDiskUsage(res.data.totalSize))
      .catch((err) => {
        console.error("Error fetching disk usage:", err);
      });
    
    // Fetch media
    fetchMedia();
  }, [token, selectedFolder, search, sort, order]);

  // Function to fetch media
  function fetchMedia() {
    if (!token) return;
    
    axios
      .get(`${API}/media`, {
        params: {
          folder: selectedFolder,
          search,
          sort,
          order,
        },
      })
      .then((res) => setMedia(res.data))
      .catch((err) => {
        console.error("Error fetching media:", err);
        setMedia([]);
      });
  }

  // Login handler
  function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    
    axios
      .post(`${API}/login`, { username: loginUser, password: loginPass })
      .then((res) => {
        const { token, username } = res.data;
        setToken(token);
        setUsername(username);
        localStorage.setItem("token", token);
        localStorage.setItem("username", username);
        setPage("gallery");
      })
      .catch((err) => {
        if (err.response && err.response.data && err.response.data.error) {
          setLoginError(err.response.data.error);
        } else {
          setLoginError("Login failed. Please try again.");
        }
      });
  }

  // Signup handler with real error display
  function handleSignup(e) {
    e.preventDefault();
    setLoginError("");
    
    axios
      .post(`${API}/signup`, { username: loginUser, password: loginPass })
      .then(() => {
        setSignupMode(false);
        setLoginError("Signup successful! Please log in.");
      })
      .catch((err) => {
        // Display the real error from the backend
        if (err.response && err.response.data && err.response.data.error) {
          setLoginError(err.response.data.error);
        } else {
          setLoginError("Signup failed. Please try again.");
        }
      });
  }

  // Logout handler
  function handleLogout() {
    setToken("");
    setUsername("");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setPage("login");
  }

  // Upload handlers
  function handleFiles(e) {
    const files = Array.from(e.target.files);
    setUploadFiles(files);
  }

  function handleUpload() {
    if (!uploadFiles.length) return;
    
    const totalSize = uploadFiles.reduce((a, b) => a + b.size, 0);
    if (totalSize > 5 * 1024 * 1024 * 1024) {
      setUploadStatus("Error: Max 5GB per upload.");
      return;
    }
    
    const formData = new FormData();
    uploadFiles.forEach((f) => formData.append("files", f));
    
    setUploadStatus("Uploading...");
    
    axios
      .post(`${API}/upload`, formData)
      .then((res) => {
        setUploadStatus(`Upload successful! ${res.data.count} files uploaded.`);
        setTimeout(() => {
          setUploadFiles([]);
          setUploadModal(false);
          fetchMedia();
        }, 1500);
      })
      .catch((err) => {
        if (err.response && err.response.data && err.response.data.error) {
          setUploadStatus(`Error: ${err.response.data.error}`);
        } else {
          setUploadStatus("Upload failed. Please try again.");
        }
      });
  }

  // Media actions
  function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this file?")) return;
    
    axios
      .delete(`${API}/media/${id}`)
      .then(() => {
        setModalMedia(null);
        fetchMedia();
      })
      .catch((err) => {
        alert(err.response?.data?.error || "Delete failed");
      });
  }

  function handleDownload(id) {
    window.open(`${API}/media/${id}/download`, "_blank");
  }

  // Render functions
  function renderTopBar() {
    return (
      <div className="topbar">
        <div className="logo">Family Photo Gallery</div>
        <div className="disk-usage">
          Disk Used: {(diskUsage / (1024 * 1024 * 1024)).toFixed(2)} GB
        </div>
        <div className="user-actions">
          <span className="username">{username}</span>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    );
  }

  function renderSidebar() {
    return (
      <div className="sidebar">
        <div
          className={selectedFolder === "" ? "folder active" : "folder"}
          onClick={() => setSelectedFolder("")}
        >
          All Media
        </div>
        
        {folders.special?.map((f) => (
          <div
            key={f}
            className={selectedFolder === f ? "folder active" : "folder"}
            onClick={() => setSelectedFolder(f)}
          >
            {f === "uploaded_by_you" ? "Uploaded by You" : f}
          </div>
        ))}
        
        {folders.months?.length > 0 && <div className="folder-heading">Months</div>}
        
        {folders.months?.map((f) => (
          <div
            key={f}
            className={selectedFolder === f ? "folder active" : "folder"}
            onClick={() => setSelectedFolder(f)}
          >
            {f}
          </div>
        ))}
        
        <div
          className={selectedFolder === "control_users" ? "folder active" : "folder"}
          onClick={() => setSelectedFolder("control_users")}
        >
          Control Users
        </div>
      </div>
    );
  }

  function renderUploadModal() {
    const totalSize = uploadFiles.reduce((a, b) => a + b.size, 0);
    const percentUsed = Math.min((totalSize / (5 * 1024 ** 3)) * 100, 100);
    
    return (
      <div className="modal-bg" onClick={() => setUploadModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Upload Photos & Videos</h2>
          
          <div className="upload-info">
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFiles}
              className="file-input"
            />
            
            <div className="file-count">
              {uploadFiles.length} files selected
              <span className="file-size">
                {(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB / 5.00 GB
              </span>
            </div>
            
            <div className="progress-bar-container">
              <div 
                className="progress-bar" 
                style={{ width: `${percentUsed}%`, background: percentUsed > 90 ? '#e74c3c' : '#2ecc71' }}
              />
            </div>
            
            <div className="upload-formats">
              Allowed formats: jpg, jpeg, png, gif, webp, mp4, mov, avi, mkv
              <br />
              Maximum upload size: 5GB total
            </div>
          </div>
          
          <div className="upload-status">{uploadStatus}</div>
          
          <div className="modal-actions">
            <button
              onClick={handleUpload}
              disabled={!uploadFiles.length || totalSize > 5 * 1024 * 1024 * 1024}
              className="upload-btn"
            >
              Upload Files
            </button>
            <button onClick={() => setUploadModal(false)} className="cancel-btn">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderGallery() {
    return (
      <div className="gallery-container">
        <div className="gallery-toolbar">
          <button onClick={() => setUploadModal(true)} className="upload-btn">
            Upload New Files
          </button>
          
          <div className="search-container">
            <input
              type="text"
              placeholder="Search by name or date..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          
          <div className="sort-container">
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="sort-select">
              <option value="uploaded_at">Sort by Date</option>
              <option value="original_name">Sort by Name</option>
              <option value="size">Sort by Size</option>
            </select>
            
            <select value={order} onChange={(e) => setOrder(e.target.value)} className="order-select">
              <option value="DESC">Newest First</option>
              <option value="ASC">Oldest First</option>
            </select>
          </div>
        </div>
        
        {media.length === 0 ? (
          <div className="no-media">
            {search ? "No media matches your search" : "No media found in this folder"}
          </div>
        ) : (
          <div className="media-grid">
            {media.map((item) => (
              <div
                key={item.id}
                className="media-item"
                onClick={() => setModalMedia(item)}
              >
                {item.isImage ? (
                  <img 
                    src={`${API}/media/${item.id}`} 
                    alt={item.original_name}
                    className="media-thumbnail" 
                  />
                ) : (
                  <div className="video-thumbnail">
                    <video src={`${API}/media/${item.id}`} />
                    <div className="video-icon">▶</div>
                  </div>
                )}
                <div className="media-name">{item.original_name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderMediaModal() {
    if (!modalMedia) return null;
    
    return (
      <div className="modal-bg" onClick={() => setModalMedia(null)}>
        <div className="media-modal" onClick={(e) => e.stopPropagation()}>
          <div className="media-preview">
            {modalMedia.isImage ? (
              <img
                src={`${API}/media/${modalMedia.id}`}
                alt={modalMedia.original_name}
                className="preview-image"
              />
            ) : (
              <video
                src={`${API}/media/${modalMedia.id}`}
                controls
                autoPlay
                className="preview-video"
              />
            )}
          </div>
          
          <div className="media-info">
            <h3>{modalMedia.original_name}</h3>
            <div className="info-details">
              <div>Uploaded: {new Date(modalMedia.uploaded_at).toLocaleString()}</div>
              <div>Size: {(modalMedia.size / (1024 * 1024)).toFixed(2)} MB</div>
              <div>Type: {modalMedia.mimetype}</div>
            </div>
            
            <div className="media-actions">
              <button onClick={() => handleDownload(modalMedia.id)} className="download-btn">
                Download
              </button>
              <button onClick={() => handleDelete(modalMedia.id)} className="delete-btn">
                Delete
              </button>
              <button onClick={() => setModalMedia(null)} className="close-btn">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderLogin() {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h2>{signupMode ? "Create Account" : "Login"}</h2>
          
          <form onSubmit={signupMode ? handleSignup : handleLogin}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
              />
            </div>
            
            {loginError && <div className="auth-error">{loginError}</div>}
            
            <button type="submit" className="auth-button">
              {signupMode ? "Sign Up" : "Login"}
            </button>
          </form>
          
          <div className="auth-switch">
            {signupMode ? (
              <>
                Already have an account?{" "}
                <button onClick={() => setSignupMode(false)}>Login</button>
              </>
            ) : (
              <>
                Need an account?{" "}
                <button onClick={() => setSignupMode(true)}>Sign Up</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main render
  return (
    <div className="app">
      {token ? (
        <>
          {renderTopBar()}
          <div className="main-container">
            {renderSidebar()}
            <div className="content">
              {renderGallery()}
            </div>
          </div>
        </>
      ) : (
        renderLogin()
      )}
      
      {uploadModal && renderUploadModal()}
      {modalMedia && renderMediaModal()}
    </div>
  );
}

export default App;
