
import 'dotenv/config';

import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

import {
  User,
  UserRole,
  UserSchema,
  UserStatus,
} from 'src/modules/users/shemas/user.shema';

async function createSuperAdmin(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  const name = process.env.SUPER_ADMIN_NAME?.trim();
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!mongoUri) {
    throw new Error('MONGODB_URI est absent du fichier .env.');
  }

  if (!name || !email || !password) {
    throw new Error(
      'Renseigne SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD.',
    );
  }

  if (password.length < 12 || password.length > 72) {
    throw new Error(
      'Le mot de passe doit contenir entre 12 et 72 caractères.',
    );
  }

  await mongoose.connect(mongoUri);

  try {
    const UserModel =
      mongoose.models[User.name] ??
      mongoose.model(User.name, UserSchema);

    const existingUser = await UserModel.findOne({ email }).exec();

    if (existingUser) {
      throw new Error(
        'Cette adresse e-mail existe déjà. Aucun compte créé.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await UserModel.create({
      name,
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    });

    console.log('Super Admin créé avec succès.');
    console.log(`E-mail : ${email}`);
    console.log('Rôle : super_admin');
  } finally {
    await mongoose.disconnect();
  }
}

createSuperAdmin().catch((error: unknown) => {
  console.error(
    'Échec de création du Super Admin :',
    error instanceof Error ? error.message : error,
  );

  process.exitCode = 1;
});
