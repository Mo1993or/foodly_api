
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from 'src/modules/users/shemas/user.shema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Crée un utilisateur avec un rôle explicitement défini.
   * Le mot de passe doit déjà être haché avant cet appel.
   */
  async createUser(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }) {
    const name = data.name.trim();
    const email = data.email.trim().toLowerCase();

    const existingUser = await this.userModel
      .findOne({ email })
      .exec();

    if (existingUser) {
      throw new ConflictException(
        'Un compte utilise déjà cette adresse e-mail.',
      );
    }

    try {
      const user = await this.userModel.create({
        name,
        email,
        passwordHash: data.passwordHash,
        role: data.role,
        status: UserStatus.ACTIVE,
      });

      return this.toPublicUser(user);
    } catch (error: unknown) {
      // Protection contre deux créations simultanées avec le même e-mail.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException(
          'Un compte utilise déjà cette adresse e-mail.',
        );
      }

      throw error;
    }
  }

  /**
   * Recherche un utilisateur par son adresse e-mail.
   * Le hash du mot de passe est inclus uniquement ici,
   * pour permettre la vérification lors de la connexion.
   */
  async findByEmail(email: string) {
    return this.userModel
      .findOne({
        email: email.trim().toLowerCase(),
      })
      .select('+passwordHash')
      .exec();
  }

  /**
   * Recherche un utilisateur par son identifiant MongoDB.
   */
  async findById(id: string) {
    const user = await this.userModel
      .findById(id)
      .exec();

    if (!user) {
      throw new NotFoundException(
        'Utilisateur introuvable.',
      );
    }

    return this.toPublicUser(user);
  }

  /**
   * Liste les utilisateurs, avec filtre de rôle facultatif.
   * À réserver aux routes protégées des administrateurs.
   */
  async findAll(role?: UserRole) {
    const filter = role ? { role } : {};

    const users = await this.userModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();

    return users.map((user) => this.toPublicUser(user));
  }

  /**
   * Suspend ou réactive un compte.
   */
  async updateStatus(
    id: string,
    status: UserStatus,
  ) {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true },
      )
      .exec();

    if (!user) {
      throw new NotFoundException(
        'Utilisateur introuvable.',
      );
    }

    return this.toPublicUser(user);
  }

  /**
   * Retire le hash du mot de passe des données retournées.
   */
  toPublicUser(user: UserDocument) {
    const data = user.toObject();

    const {
      passwordHash: _passwordHash,
      ...publicUser
    } = data;

    return publicUser;
  }
}
