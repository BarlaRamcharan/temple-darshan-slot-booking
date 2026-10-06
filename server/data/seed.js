const Temple = require('../models/Temple');
const DarshanSlot = require('../models/DarshanSlot');
const OTP = require('../models/OTP');
const User = require('../models/User');

const templeList = [
  {
    name: 'Tirumala Temple',
    location: 'Tirupati',
    description: 'A sacred hill shrine devoted to Lord Venkateswara, known for divine blessings and serene darshan.',
    image: '/assets/temples/tirumala.jpg',
    imageAlt: 'Tirumala Venkateswara Temple in Tirupati',
    imageCredit: '',
  },
  {
    name: 'Yadadri Temple',
    location: 'Telangana',
    description: 'A revered temple dedicated to Lord Lakshmi Narasimha, set in a beautiful hill landscape.',
    image: '/assets/temples/yadadri.jpg',
    imageAlt: 'Sri Lakshmi Narasimha Swamy Temple at Yadadri',
    imageCredit: '',
  },
  {
    name: 'Srisailam Temple',
    location: 'Andhra Pradesh',
    description: 'One of the most famous Jyotirlinga temples, nestled in the majestic Nallamala hills.',
    image: '/assets/temples/srisailam.jpg',
    imageAlt: 'Mallikarjuna Swamy Temple at Srisailam',
    imageCredit: '',
  },
  {
    name: 'Bhadrachalam Temple',
    location: 'Telangana',
    description: 'A timeless temple dedicated to Lord Rama, drawing thousands of devotees with deep devotion.',
    image: '/assets/temples/bhadrachalam.jpg',
    imageAlt: 'Sri Sita Ramachandra Swamy Temple gopuram in Bhadrachalam',
    imageCredit: '',
  },
  {
    name: 'Kanaka Durga Temple',
    location: 'Vijayawada',
    description: 'A vibrant temple atop Indrakeeladri, offering extraordinary spiritual energy and devotion.',
    image: '/assets/temples/kanaka-durga.jpg',
    imageAlt: 'Sri Durga Malleswara Swamy Varla Devasthanam gopuram in Vijayawada',
    imageCredit: '',
  },
];

const timeSlots = [
  { label: '10:00 AM – 11:00 AM', timeStart: '10:00', timeEnd: '11:00', capacity: 85 },
  { label: '11:00 AM – 12:00 PM', timeStart: '11:00', timeEnd: '12:00', capacity: 42 },
  { label: '12:00 PM – 01:00 PM', timeStart: '12:00', timeEnd: '13:00', capacity: 18 },
  { label: '01:00 PM – 02:00 PM', timeStart: '13:00', timeEnd: '14:00', capacity: 9 },
  { label: '02:00 PM – 03:00 PM', timeStart: '14:00', timeEnd: '15:00', capacity: 30 },
];

async function seedDatabase() {
  await OTP.deleteMany({ email: { $exists: false } });

  for (const collection of [OTP.collection, User.collection]) {
    const indexes = await collection.indexes().catch((error) => {
      if (error.codeName === 'NamespaceNotFound') {
        return [];
      }
      throw error;
    });
    if (indexes.some((index) => index.name === 'mobileNumber_1')) {
      await collection.dropIndex('mobileNumber_1');
    }
  }

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail) {
    await User.findOneAndUpdate(
      { email: adminEmail },
      { $setOnInsert: { email: adminEmail, name: 'Admin' }, $set: { role: 'admin' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const templeCount = await Temple.countDocuments();
  if (templeCount > 0) {
    await Promise.all(templeList.map(({ name, image, imageAlt, imageCredit }) => (
      Temple.updateOne({ name }, { $set: { image, imageAlt, imageCredit } })
    )));
    return;
  }

  const temples = await Temple.insertMany(templeList);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  for (const temple of temples) {
    for (let offset = 0; offset < 30; offset += 1) {
      const slotDate = new Date(startDate);
      slotDate.setDate(startDate.getDate() + offset);
      const dateString = slotDate.toISOString().split('T')[0];
      const dayName = slotDate.toLocaleDateString('en-US', { weekday: 'long' });

      for (const slotTemplate of timeSlots) {
        const capacity = slotTemplate.capacity;
        const additionFactor = offset % 4 === 0 ? 0.8 : offset % 3 === 0 ? 0.55 : 0.32;
        const bookedCount = Math.min(capacity, Math.max(0, Math.floor(capacity * additionFactor)));

        await DarshanSlot.create({
          templeId: temple._id,
          date: dateString,
          day: dayName,
          timeLabel: slotTemplate.label,
          timeStart: slotTemplate.timeStart,
          timeEnd: slotTemplate.timeEnd,
          capacity,
          bookedCount: offset % 6 === 0 && slotTemplate.label === '01:00 PM – 02:00 PM' ? capacity : bookedCount,
        });
      }
    }
  }

  console.log('Database seeded with temple and slot data.');
}

module.exports = { seedDatabase, templeList, timeSlots };
