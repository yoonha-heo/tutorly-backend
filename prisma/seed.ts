import { PrismaClient, TeacherStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Language
  await prisma.language.createMany({
    data: [
      { code: 'en', name: 'English' },
      { code: 'ko', name: 'Korean' },
      { code: 'ja', name: 'Japanese' },
    ],
    skipDuplicates: true,
  });

  // Specialty
  await prisma.specialty.createMany({
    data: [
      { code: 'conversation', name: 'Conversation' },
      { code: 'business', name: 'Business' },
      { code: 'ielts', name: 'IELTS' },
    ],
    skipDuplicates: true,
  });

  const english = await prisma.language.findUnique({
    where: { code: 'en' },
  });

  const korean = await prisma.language.findUnique({
    where: { code: 'ko' },
  });

  const conversation = await prisma.specialty.findUnique({
    where: { name: 'Conversation' },
  });

  const ielts = await prisma.specialty.findUnique({
    where: { name: 'IELTS' },
  });

  // Teacher User 1
  const teacher1 = await prisma.user.create({
    data: {
      email: 'teacher1@test.com',
      name: 'John Doe',
      providerId: 'teacher-1',
      role: UserRole.TEACHER,
    },
  });

  const profile1 = await prisma.teacherProfile.create({
    data: {
      userId: teacher1.id,
      headline: 'English Conversation Tutor',
      bio: '10 years of teaching experience',
      hourlyRate: 30,
      status: TeacherStatus.APPROVED,
    },
  });

  // Teacher User 2
  const teacher2 = await prisma.user.create({
    data: {
      email: 'teacher2@test.com',
      name: 'Jane Smith',
      providerId: 'teacher-2',
      role: UserRole.TEACHER,
    },
  });

  const profile2 = await prisma.teacherProfile.create({
    data: {
      userId: teacher2.id,
      headline: 'IELTS Specialist',
      bio: 'Helped 300+ students',
      hourlyRate: 40,
      status: TeacherStatus.APPROVED,
    },
  });

  // Teacher Languages
  await prisma.teacherLanguage.createMany({
    data: [
      {
        teacherId: profile1.id,
        languageId: english!.id,
      },
      {
        teacherId: profile1.id,
        languageId: korean!.id,
      },
      {
        teacherId: profile2.id,
        languageId: english!.id,
      },
    ],
  });

  // Teacher Specialties
  await prisma.teacherSpecialty.createMany({
    data: [
      {
        teacherId: profile1.id,
        specialtyId: conversation!.id,
      },
      {
        teacherId: profile2.id,
        specialtyId: ielts!.id,
      },
    ],
  });

  console.log('🌱 Seed completed');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
