const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));  // ✅ Allow all connections
app.use(bodyParser.json());

const CONNECTION_STRING = 'mongodb+srv://Shahbaz:12345@cluster1.315fe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const client = new MongoClient(CONNECTION_STRING);

const DATABASE_NAME = 'LoginApp';

// Connect to MongoDB with error handling
client.connect()
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// User Login
// User Login
app.post('/login', async (req, res) => {
  const { username, password, userType } = req.body; // userType is 'teacher' or 'student'

  try {
    const db = client.db(DATABASE_NAME);
    let collection;

    if (userType === 'teacher') {
      collection = db.collection('users'); // Check in users collection
    } else {
      collection = db.collection('studentlogin'); // Check in studentlogin collection
    }

    const user = await collection.findOne({ username });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.password === password) {
      return res.status(200).json({ success: true, message: 'Authenticated', username, userType });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Register a User (Teacher or Student)
app.post('/register', async (req, res) => {
  const { username, password, userType, securityQuestion, securityAnswer, rollNo } = req.body;

  try {
    const db = client.db(DATABASE_NAME);
    const usersCollection = db.collection('users');
    const studentsCollection = db.collection('studentlogin');
    const studentRecords = db.collection('students'); // Collection to store student roll numbers

    // If registering as a teacher, ensure username is unique
    if (userType === 'teacher') {
      const existingTeacher = await usersCollection.findOne({ username });
      if (existingTeacher) {
        return res.status(400).json({ success: false, message: 'Username already taken. Choose another.' });
      }

      await usersCollection.insertOne({ username, password, securityQuestion, securityAnswer });
      return res.status(201).json({ success: true, message: 'Teacher account created successfully' });
    }

    // If registering as a student, check roll number uniqueness
    let assignedRollNo = rollNo ? parseInt(rollNo) : null;

    if (userType === 'student') {
      // If rollNo is provided, check uniqueness
      if (assignedRollNo) {
        const rollNoExists = await studentRecords.findOne({ rollNo: assignedRollNo });
        if (rollNoExists) {
          return res.status(400).json({ success: false, message: 'Roll number already in use. Choose another.' });
        }
      } else {
        // If no roll number is provided, assign the lowest available roll number
        const allRollNos = await studentRecords.find({}, { projection: { rollNo: 1 } }).toArray();
        const takenRollNos = allRollNos.map(s => s.rollNo).sort((a, b) => a - b);

        assignedRollNo = 1;
        for (let i = 0; i < takenRollNos.length; i++) {
          if (takenRollNos[i] !== i + 1) {
            assignedRollNo = i + 1;
            break;
          }
          assignedRollNo = takenRollNos.length + 1;
        }
      }

      // Store student in studentlogin and students collection
      await studentsCollection.insertOne({ username, password, securityQuestion, securityAnswer, rollNo: assignedRollNo });
      await studentRecords.insertOne({ username, rollNo: assignedRollNo });

      return res.status(201).json({ success: true, message: `Student account created successfully. Assigned Roll No: ${assignedRollNo}` });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating account' });
  }
});





// Forgot Password
app.post('/forgotPassword', async (req, res) => {
  const { username, securityAnswer, newPassword } = req.body;

  try {
    const db = client.db(DATABASE_NAME);
    const userCollection = db.collection('users');
    const studentCollection = db.collection('studentlogin');

    let user = await userCollection.findOne({ username });
    let isTeacher = true;

    if (!user) {
      user = await studentCollection.findOne({ username });
      isTeacher = false;
    }

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.securityAnswer !== securityAnswer) return res.status(401).json({ success: false, message: 'Incorrect security answer' });

    const collectionToUpdate = isTeacher ? userCollection : studentCollection;
    await collectionToUpdate.updateOne({ username }, { $set: { password: newPassword } });

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating password' });
  }
});


// Start Server
const PORT = process.env.PORT || 3000;  // ✅ Use Railway's assigned port

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});


// Create Class
app.post('/createClass', async (req, res) => {
  const { teacherUsername, className, students } = req.body;

  try {
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('classes');

    await collection.insertOne({ teacherUsername, className, students });

    res.status(201).json({ success: true, message: 'Class created' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating class' });
  }
});

// View Teacher's Classes
app.get('/viewClasses/:teacherUsername', async (req, res) => {
  const { teacherUsername } = req.params;

  try {
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('classes');

    const classes = await collection.find({ teacherUsername }).toArray();
    res.status(200).json({ success: true, classes });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching classes' });
  }
});

// View Class Details
app.get('/classDetails/:classId', async (req, res) => {
  const { classId } = req.params;

  try {
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('classes');

    const classData = await collection.findOne({ _id: new ObjectId(classId) });
    res.status(200).json({ success: true, classData });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching class details' });
  }
});

// Take or Update Attendance with Class Name
app.post('/takeAttendance', async (req, res) => {
  const { classId, className, date, records } = req.body;

  try {
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('attendance');

    // Check if attendance for this class on this date already exists
    const existingAttendance = await collection.findOne({ classId: new ObjectId(classId), date });

    if (existingAttendance) {
      // Update existing attendance
      await collection.updateOne(
        { classId: new ObjectId(classId), date },
        { $set: { records, className } }
      );
      return res.status(200).json({ success: true, message: 'Attendance updated successfully' });
    } else {
      // Create new attendance entry with className
      await collection.insertOne({ classId: new ObjectId(classId), className, date, records });
      return res.status(201).json({ success: true, message: 'Attendance recorded successfully' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error recording attendance' });
  }
});


// Fetch Attendance for a Specific Class on a Given Date
app.get('/attendance/:classId/:date', async (req, res) => {
  const { classId, date } = req.params;

  try {
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('attendance');

    const attendance = await collection.findOne({ classId: new ObjectId(classId), date });

    if (attendance) {
      res.status(200).json({ success: true, attendance });
    } else {
      res.status(200).json({ success: false, message: 'No attendance found for this date' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching attendance' });
  }
});


app.get('/viewStudentDashboard/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const db = client.db(DATABASE_NAME);
    const studentCollection = db.collection('studentlogin');
    const classCollection = db.collection('classes');
    const attendanceCollection = db.collection('attendance');

    // ✅ Fetch student details
    const student = await studentCollection.findOne({ username });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

 

    // ✅ Fix: Check inside student objects within `students` array
    const classes = await classCollection.find({
      students: {
        $elemMatch: { $or: [{ username }, { rollNo: student.rollNo }] }
      }
    }).toArray();

    // ✅ Debugging: Log enrolled classes
   

    // ✅ Fetch attendance records
    const attendanceRecords = await attendanceCollection.find({ "records.studentName": username }).toArray();

    res.status(200).json({
      success: true,
      student,
      classes,
      attendance: attendanceRecords
    });
  } catch (err) {
 
    res.status(500).json({ success: false, message: 'Error fetching student dashboard data' });
  }
});


// Fetch all students from 'students' collection
app.get('/students', async (req, res) => {
  try {
    const db = client.db(DATABASE_NAME);
    const studentsCollection = db.collection('students');

    const students = await studentsCollection.find().toArray();
    res.status(200).json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching students' });
  }
});
