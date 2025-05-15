const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'your-secret-key'; // Change this in production

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Database connection - using callback style instead of promise
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // replace with your MySQL username
  password: 'Dcuniverse@9192631770', // replace with your MySQL password
  database: 'family',
  port: 3306, // adjust if needed
  charset: 'utf8mb4' // Add this to help with character encoding
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL database:', err);
    process.exit(1); // Exit if can't connect to database
  }
  console.log('Connected to MySQL database');
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
  if ([...allowedImageTypes, ...allowedVideoTypes].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024 // 5GB
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    
    // Check if user exists
    db.query('SELECT id FROM users WHERE id = ?', [decoded.id], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length === 0) return res.status(403).json({ error: 'User not found' });
      
      // Check if user is admin
      db.query('SELECT role FROM user_roles WHERE user_id = ?', [decoded.id], (err, roles) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        req.user = decoded;
        req.isAdmin = roles.length > 0 && roles[0].role === 'admin';
        next();
      });
    });
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

//==========================================================
// AUTH ROUTES
//==========================================================

// Register/signup - Using callback pattern instead of promises
app.post('/api/signup', (req, res) => {
  const { username, password } = req.body;
  
  // Validate input
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // Check if user exists
  db.query('SELECT id FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      console.error('Signup error checking username:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    if (results.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    // Hash password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Signup error hashing password:', err);
        return res.status(500).json({ error: 'Error processing password: ' + err.message });
      }
      
      // Insert user
      db.query(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        [username, hashedPassword],
        (err, result) => {
          if (err) {
            console.error('Signup error inserting user:', err);
            return res.status(500).json({ error: 'Error creating user: ' + err.message });
          }
          
          // Add user role
          db.query(
            'INSERT INTO user_roles (user_id, role) VALUES (?, ?)',
            [result.insertId, 'user'],
            (err) => {
              if (err) {
                console.error('Signup error adding user role:', err);
                return res.status(500).json({ error: 'Error setting user role: ' + err.message });
              }
              
              // Success
              res.status(201).json({ message: 'User created successfully' });
            }
          );
        }
      );
    });
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.query(
    'SELECT id, username, password_hash FROM users WHERE username = ?',
    [username],
    (err, results) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
      }
      
      if (results.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      
      const user = results[0];
      
      // Compare password
      bcrypt.compare(password, user.password_hash, (err, isMatch) => {
        if (err) {
          console.error('Login password compare error:', err);
          return res.status(500).json({ error: 'Error validating password: ' + err.message });
        }
        
        if (!isMatch) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        // Update last login
        db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
        
        // Generate token
        const token = jwt.sign(
          { id: user.id, username: user.username },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        res.json({ token, username: user.username });
      });
    }
  );
});

//==========================================================
// MEDIA ROUTES
//==========================================================

// Upload multiple files (photos/videos)
app.post('/api/upload', authenticateToken, upload.array('files', 100), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  // Calculate total size
  const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
  
  // Check if total exceeds 5GB
  if (totalSize > 5 * 1024 * 1024 * 1024) {
    // Remove the uploaded files
    req.files.forEach(file => {
      fs.unlinkSync(file.path);
    });
    return res.status(400).json({ error: 'Total upload size exceeds 5GB limit' });
  }
  
  // Get current month folder (YYYY-MM)
  const currentDate = new Date();
  const folder = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  
  // Counter for successful inserts
  let successCount = 0;
  
  // Insert each file into the database
  req.files.forEach(file => {
    db.query(
      'INSERT INTO media (user_id, filename, original_name, mimetype, size, folder) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, file.filename, file.originalname, file.mimetype, file.size, folder],
      (err) => {
        if (err) {
          console.error('Error inserting file:', err);
          // Continue with other files even if one fails
        } else {
          successCount++;
        }
        
        // Check if this is the last file
        if (successCount === req.files.length || successCount + 1 === req.files.length) {
          res.status(201).json({ 
            message: 'Files uploaded successfully', 
            count: successCount,
            totalSize
          });
        }
      }
    );
  });
});

// Get all media with search, sort, and filter
app.get('/api/media', authenticateToken, (req, res) => {
  const { search, sort = 'uploaded_at', order = 'DESC', folder } = req.query;
  
  // Build query
  let query = 'SELECT * FROM media WHERE 1';
  const params = [];
  
  // Search filter
  if (search) {
    query += ' AND (original_name LIKE ? OR DATE_FORMAT(uploaded_at, "%Y-%m-%d") LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  // Folder filter
  if (folder) {
    if (folder === 'uploaded_by_you') {
      query += ' AND user_id = ?';
      params.push(req.user.id);
    } else {
      query += ' AND folder = ?';
      params.push(folder);
    }
  }
  
  // Validate sort field (security)
  const allowedSortFields = ['uploaded_at', 'original_name', 'size'];
  const safeSort = allowedSortFields.includes(sort) ? sort : 'uploaded_at';
  
  // Validate order (security)
  const safeOrder = order === 'ASC' ? 'ASC' : 'DESC';
  
  // Add sorting
  query += ` ORDER BY ${safeSort} ${safeOrder}`;
  
  // Execute query
  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Get media error:', err);
      return res.status(500).json({ error: 'Error retrieving media: ' + err.message });
    }
    
    // Add download URLs
    const mediaWithUrls = results.map(item => ({
      ...item,
      url: `/api/media/${item.id}`,
      isImage: item.mimetype.startsWith('image/')
    }));
    
    res.json(mediaWithUrls);
  });
});

// Get media by ID
app.get('/api/media/:id', (req, res) => {
  db.query('SELECT * FROM media WHERE id = ?', [req.params.id], (err, results) => {
    if (err) {
      console.error('Get media by ID error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    const file = results[0];
    const filePath = path.join(UPLOADS_DIR, file.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set content type
    res.setHeader('Content-Type', file.mimetype);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  });
});

// Download media
app.get('/api/media/:id/download', authenticateToken, (req, res) => {
  db.query('SELECT * FROM media WHERE id = ?', [req.params.id], (err, results) => {
    if (err) {
      console.error('Download error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    const file = results[0];
    const filePath = path.join(UPLOADS_DIR, file.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Use original filename for download
    res.download(filePath, file.original_name);
  });
});

// Delete media
app.delete('/api/media/:id', authenticateToken, (req, res) => {
  // First check if user owns the media or is admin
  db.query('SELECT * FROM media WHERE id = ?', [req.params.id], (err, results) => {
    if (err) {
      console.error('Delete media error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    const file = results[0];
    
    // Verify ownership or admin
    if (file.user_id !== req.user.id && !req.isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to delete this file' });
    }
    
    // Delete the file from storage
    const filePath = path.join(UPLOADS_DIR, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete from database
    db.query('DELETE FROM media WHERE id = ?', [req.params.id], (err) => {
      if (err) {
        console.error('Delete from database error:', err);
        return res.status(500).json({ error: 'Error deleting from database: ' + err.message });
      }
      
      res.json({ message: 'Media deleted successfully' });
    });
  });
});

//==========================================================
// FOLDER ROUTES
//==========================================================

// Get all folders
app.get('/api/folders', authenticateToken, (req, res) => {
  // Get distinct folders from media
  db.query('SELECT DISTINCT folder FROM media ORDER BY folder DESC', (err, results) => {
    if (err) {
      console.error('Get folders error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    // Include special folders
    const folderList = results.map(f => f.folder);
    
    // Add 'uploaded_by_you' virtual folder
    const response = {
      special: ['uploaded_by_you'],
      months: folderList
    };
    
    res.json(response);
  });
});

//==========================================================
// USER MANAGEMENT ROUTES (ADMIN ONLY)
//==========================================================

// Get all users (admin only)
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  db.query(`
    SELECT u.id, u.username, u.created_at, u.last_login, r.role
    FROM users u
    LEFT JOIN user_roles r ON u.id = r.user_id
  `, (err, results) => {
    if (err) {
      console.error('Get users error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    res.json(results);
  });
});

// Create new user (admin only)
app.post('/api/users', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // Check if user exists
  db.query('SELECT id FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      console.error('Create user error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    if (results.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    // Hash password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Hash password error:', err);
        return res.status(500).json({ error: 'Error processing password: ' + err.message });
      }
      
      // Create user
      db.query(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        [username, hashedPassword],
        (err, result) => {
          if (err) {
            console.error('Insert user error:', err);
            return res.status(500).json({ error: 'Error creating user: ' + err.message });
          }
          
          // Assign role
          const userRole = role === 'admin' ? 'admin' : 'user';
          db.query(
            'INSERT INTO user_roles (user_id, role) VALUES (?, ?)',
            [result.insertId, userRole],
            (err) => {
              if (err) {
                console.error('Assign role error:', err);
                return res.status(500).json({ error: 'Error setting user role: ' + err.message });
              }
              
              res.status(201).json({ message: 'User created successfully' });
            }
          );
        }
      );
    });
  });
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;
  
  // Prevent admin from deleting themselves
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  // Check if user exists
  db.query('SELECT id FROM users WHERE id = ?', [userId], (err, results) => {
    if (err) {
      console.error('Delete user error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Find all media owned by this user
    db.query('SELECT filename FROM media WHERE user_id = ?', [userId], (err, media) => {
      if (err) {
        console.error('Find user media error:', err);
        return res.status(500).json({ error: 'Error finding user media: ' + err.message });
      }
      
      // Delete all files owned by the user
      media.forEach(file => {
        const filePath = path.join(UPLOADS_DIR, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      
      // Delete user (CASCADE will delete related records)
      db.query('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) {
          console.error('Delete user from DB error:', err);
          return res.status(500).json({ error: 'Error deleting user: ' + err.message });
        }
        
        res.json({ message: 'User and all associated media deleted successfully' });
      });
    });
  });
});

//==========================================================
// UTILITY ROUTES
//==========================================================

// Get total disk usage
app.get('/api/disk-usage', authenticateToken, (req, res) => {
  db.query('SELECT SUM(size) as totalSize FROM media', (err, results) => {
    if (err) {
      console.error('Disk usage error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    const totalSize = results[0].totalSize || 0;
    
    res.json({
      totalSize,
      totalSizeFormatted: `${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`
    });
  });
});

// Default route for root path
app.get('/', (req, res) => {
  res.send('Family Photo Gallery API - Server is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
