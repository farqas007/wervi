import { redirect } from 'next/navigation';
import ProfileForm from '@/components/profile/profile-form';
import {
  fetchCategories,
  fetchMyLanguages,
  fetchMyProfile,
  fetchMySkills,
  fetchSkills,
} from '@/lib/profiles';
import { getServerSession } from '@/lib/server-auth';

export default async function ProfilePage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect('/login');
  }

  const [profile, skills, languages, categories, allSkills] = await Promise.all(
    [
      fetchMyProfile(),
      fetchMySkills(),
      fetchMyLanguages(),
      fetchCategories(),
      fetchSkills(),
    ],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-muted-foreground text-sm">
          Manage your freelancer and client details, skills, and languages.
        </p>
      </div>
      <ProfileForm
        initialProfile={{
          freelancer: profile.freelancer ?? undefined,
          client: profile.client ?? undefined,
        }}
        initialSkills={skills.items.map((item) => ({
          skillId: item.skill.id,
          proficiency: item.proficiency,
          yearsExperience: item.yearsExperience,
          isFeatured: item.isFeatured,
        }))}
        initialLanguages={languages.items}
        categories={categories.items}
        allSkills={allSkills.items}
      />
    </div>
  );
}
