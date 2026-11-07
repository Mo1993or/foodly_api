
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Offer,
  OfferDocument,
} from './schemas/offer.schema';

import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';

@Injectable()
export class OffersService {
  constructor(
    @InjectModel(Offer.name)
    private readonly offerModel: Model<OfferDocument>,
  ) {}

  /**
   * Liste publique des offres actives.
   */
  async findAll() {
    const offers = await this.offerModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, price: 1 })
      .lean()
      .exec();

    return {
      count: offers.length,
      data: offers,
    };
  }

  /**
   * Liste complète réservée au Super Admin.
   */
  async findAllAdmin() {
    const offers = await this.offerModel
      .find()
      .sort({ sortOrder: 1, price: 1 })
      .lean()
      .exec();

    return {
      count: offers.length,
      data: offers,
    };
  }

  /**
   * Détail public d'une offre active.
   */
  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Offre introuvable.');
    }

    const offer = await this.offerModel
      .findOne({
        _id: id,
        isActive: true,
      })
      .exec();

    if (!offer) {
      throw new NotFoundException('Offre introuvable.');
    }

    return {
      data: offer,
    };
  }

  /**
   * Création d'une offre.
   */
  async create(dto: CreateOfferDto) {
    const existingOffer = await this.offerModel
      .findOne({ code: dto.code })
      .exec();

    if (existingOffer) {
      throw new ConflictException(
        'Une offre avec ce code existe déjà.',
      );
    }

    try {
      const offer = await this.offerModel.create(dto);

      return {
        message: 'Offre créée avec succès.',
        data: offer,
      };
    } catch (error) {
      if (error?.code === 11000) {
        throw new ConflictException(
          'Une offre avec ce code existe déjà.',
        );
      }

      throw error;
    }
  }

  /**
   * Modification d'une offre.
   */
  async update(id: string, dto: UpdateOfferDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Offre introuvable.');
    }

    if (dto.code) {
      const existingOffer = await this.offerModel
        .findOne({
          code: dto.code,
          _id: { $ne: id },
        })
        .exec();

      if (existingOffer) {
        throw new ConflictException(
          'Une autre offre utilise déjà ce code.',
        );
      }
    }

    try {
      const offer = await this.offerModel
        .findByIdAndUpdate(
          id,
          { $set: dto },
          {
            new: true,
            runValidators: true,
          },
        )
        .exec();

      if (!offer) {
        throw new NotFoundException('Offre introuvable.');
      }

      return {
        message: 'Offre modifiée avec succès.',
        data: offer,
      };
    } catch (error) {
      if (error?.code === 11000) {
        throw new ConflictException(
          'Ce code d’offre est déjà utilisé.',
        );
      }

      throw error;
    }
  }

  /**
   * Activation d'une offre.
   */
  async activate(id: string) {
    return this.update(id, { isActive: true });
  }

  /**
   * Désactivation d'une offre.
   */
  async deactivate(id: string) {
    return this.update(id, { isActive: false });
  }
}
