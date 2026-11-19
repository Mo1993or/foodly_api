
import {
  Injectable,
  Logger,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  initializeApp,
  cert,
  getApps,
  App,
} from 'firebase-admin/app';

import {
  getMessaging,
  Messaging,
} from 'firebase-admin/messaging';

import {
  DeviceToken,
  DeviceTokenDocument,
} from './schemas/device-token.schema';

import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private firebaseApp: App | null = null;
  private messaging: Messaging | null = null;

  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,

    private readonly configService: ConfigService,
  ) {
    this.initializeFirebase();
  }

  /**
   * Initialisation Firebase Admin SDK
   */
  private initializeFirebase(): void {
    const projectId = this.configService.get<string>(
      'FIREBASE_PROJECT_ID',
    );

    const clientEmail = this.configService.get<string>(
      'FIREBASE_CLIENT_EMAIL',
    );

    const rawPrivateKey = this.configService.get<string>(
      'FIREBASE_PRIVATE_KEY',
    );

    const privateKey = rawPrivateKey
      ?.trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase non configuré. Les notifications push sont désactivées.',
      );
      return;
    }

    try {
      const existingApp = getApps().find(
        (app) => app.name === 'foodly-firebase',
      );

      this.firebaseApp =
        existingApp ??
        initializeApp(
          {
            credential: cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          },
          'foodly-firebase',
        );

      this.messaging = getMessaging(this.firebaseApp);

      this.logger.log('Firebase Admin initialisé avec succès.');
    } catch (error) {
      this.logger.error(
        'Erreur lors de l’initialisation Firebase.',
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Vérifie que Firebase est disponible.
   */
  private getMessagingInstance(): Messaging {
    if (!this.messaging) {
      throw new ServiceUnavailableException(
        'Le service Firebase Notifications n’est pas configuré.',
      );
    }

    return this.messaging;
  }

  /**
   * Enregistrer ou actualiser un token FCM.
   */
  async registerDeviceToken(
    userId: string,
    dto: RegisterDeviceTokenDto,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new InternalServerErrorException(
        'Identifiant utilisateur invalide.',
      );
    }

    const device = await this.deviceTokenModel.findOneAndUpdate(
      { token: dto.token },
      {
        $set: {
          userId: new Types.ObjectId(userId),
          token: dto.token,
          platform: dto.platform,
          deviceId: dto.deviceId,
          isActive: true,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    return {
      message: 'Token FCM enregistré avec succès.',
      platform: device.platform,
    };
  }

  /**
   * Désactiver un token FCM.
   */
  async unregisterDeviceToken(
    userId: string,
    token: string,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new InternalServerErrorException(
        'Identifiant utilisateur invalide.',
      );
    }

    await this.deviceTokenModel.updateOne(
      {
        userId: new Types.ObjectId(userId),
        token,
      },
      {
        $set: {
          isActive: false,
        },
      },
    );

    return {
      message: 'Appareil désactivé avec succès.',
    };
  }

  /**
   * Envoyer une notification directement à un token FCM.
   * Utilisé notamment pour notifier le client concernant sa commande.
   */
  async sendToToken(
    token: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ) {
    if (!token || !token.trim()) {
      return {
        success: false,
        message: 'Aucun token FCM disponible.',
      };
    }

    const messaging = this.getMessagingInstance();

    try {
      const messageId = await messaging.send({
        token: token.trim(),

        notification: {
          title,
          body,
        },

        data,

        android: {
          priority: 'high',
          notification: {
            sound: 'default',
          },
        },

        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      });

      this.logger.log(
        `Notification envoyée avec succès : ${messageId}`,
      );

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      this.logger.error(
        'Échec de l’envoi de la notification FCM.',
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Envoyer une notification à tous les appareils d'un utilisateur.
   * Utilisé notamment pour notifier les restaurateurs.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new InternalServerErrorException(
        'Identifiant utilisateur invalide.',
      );
    }

    const messaging = this.getMessagingInstance();

    const devices = await this.deviceTokenModel.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!devices.length) {
      return {
        success: true,
        sent: 0,
        message: 'Aucun appareil actif pour cet utilisateur.',
      };
    }

    let sent = 0;
    let failed = 0;

    // FCM accepte au maximum 500 tokens par envoi multicast.
    for (let i = 0; i < devices.length; i += 500) {
      const batch = devices.slice(i, i + 500);

      const response = await messaging.sendEachForMulticast({
        tokens: batch.map((device) => device.token),

        notification: {
          title,
          body,
        },

        data,

        android: {
          priority: 'high',
        },

        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      });

      sent += response.successCount;
      failed += response.failureCount;

      // Nettoyage des tokens devenus invalides.
      const invalidTokens: string[] = [];

      response.responses.forEach((result, index) => {
        if (
          !result.success &&
          (
            result.error?.code ===
              'messaging/registration-token-not-registered' ||
            result.error?.code ===
              'messaging/invalid-registration-token'
          )
        ) {
          invalidTokens.push(batch[index].token);
        }
      });

      if (invalidTokens.length) {
        await this.deviceTokenModel.updateMany(
          {
            token: { $in: invalidTokens },
          },
          {
            $set: { isActive: false },
          },
        );
      }
    }
     console.log(
      `La commande  a été enregistrée,et  envoyée : push ${sent} fail ${failed.valueOf}`,
    );
    return {
      success: true,
      sent,
      failed,
      totalDevices: devices.length,
    };
  }
}
