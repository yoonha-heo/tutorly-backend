import { PrismaClient, TeacherStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const languages = [
  { code: 'en', name: 'English' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
];

const specialties = [
  { code: 'conversation', name: 'Conversation' },
  { code: 'business', name: 'Business' },
  { code: 'ielts', name: 'IELTS' },
  { code: 'grammar', name: 'Grammar' },
  { code: 'kids', name: 'Kids' },
  { code: 'test-prep', name: 'Test Prep' },
];

const teacherHeadlines = [
  'Conversation Coach',
  'Business Language Tutor',
  'Exam Preparation Specialist',
  'Grammar and Writing Mentor',
  'Kids Language Teacher',
  'Beginner Friendly Tutor',
  'Pronunciation Trainer',
  'Interview Practice Coach',
  'Academic Writing Tutor',
  'Travel Language Guide',
];

async function main() {
  await prisma.language.createMany({
    data: languages,
    skipDuplicates: true,
  });

  await prisma.specialty.createMany({
    data: specialties,
    skipDuplicates: true,
  });

  const savedLanguages = await prisma.language.findMany({
    where: {
      code: {
        in: languages.map((language) => language.code),
      },
    },
    orderBy: {
      code: 'asc',
    },
  });

  const savedSpecialties = await prisma.specialty.findMany({
    where: {
      code: {
        in: specialties.map((specialty) => specialty.code),
      },
    },
    orderBy: {
      code: 'asc',
    },
  });

  const users = await Promise.all(
    Array.from({ length: 100 }, async (_, index) => {
      const number = index + 1;
      const paddedNumber = String(number).padStart(3, '0');
      const isTeacher = number <= 70;

      return prisma.user.upsert({
        where: {
          email: `user${paddedNumber}@test.com`,
        },
        update: {
          name: isTeacher
            ? `Teacher ${paddedNumber}`
            : `Student ${paddedNumber}`,
          role: isTeacher ? UserRole.TEACHER : UserRole.STUDENT,
        },
        create: {
          email: `user${paddedNumber}@test.com`,
          name: isTeacher
            ? `Teacher ${paddedNumber}`
            : `Student ${paddedNumber}`,
          providerId: `seed-user-${paddedNumber}`,
          role: isTeacher ? UserRole.TEACHER : UserRole.STUDENT,
        },
      });
    }),
  );

  const teacherProfiles = await Promise.all(
    users.slice(0, 70).map((user, index) => {
      const headline = teacherHeadlines[index % teacherHeadlines.length];

      return prisma.teacherProfile.upsert({
        where: {
          userId: user.id,
        },
        update: {
          headline,
          bio: `${headline} with ${index + 3} years of teaching experience.`,
          hourlyRate: 20 + (index % 9) * 5,
          status: TeacherStatus.APPROVED,
        },
        create: {
          userId: user.id,
          headline,
          bio: `${headline} with ${index + 3} years of teaching experience.`,
          hourlyRate: 20 + (index % 9) * 5,
          status: TeacherStatus.APPROVED,
        },
      });
    }),
  );

  await prisma.teacherLanguage.createMany({
    data: teacherProfiles.flatMap((teacherProfile, index) => {
      const firstLanguage = savedLanguages[index % savedLanguages.length];
      const secondLanguage = savedLanguages[(index + 1) % savedLanguages.length];
      const thirdLanguage = savedLanguages[(index + 2) % savedLanguages.length];

      return [firstLanguage, secondLanguage, thirdLanguage].map((language) => ({
        teacherId: teacherProfile.id,
        languageId: language.id,
      }));
    }),
    skipDuplicates: true,
  });

  await prisma.teacherSpecialty.createMany({
    data: teacherProfiles.flatMap((teacherProfile, index) => {
      const firstSpecialty = savedSpecialties[index % savedSpecialties.length];
      const secondSpecialty =
        savedSpecialties[(index + 2) % savedSpecialties.length];
      const thirdSpecialty =
        savedSpecialties[(index + 4) % savedSpecialties.length];

      return [firstSpecialty, secondSpecialty, thirdSpecialty].map(
        (specialty) => ({
          teacherId: teacherProfile.id,
          specialtyId: specialty.id,
        }),
      );
    }),
    skipDuplicates: true,
  });

  console.log('Seed completed');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
