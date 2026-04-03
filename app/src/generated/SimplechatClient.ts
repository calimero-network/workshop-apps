/** @generated stub from spec — will be replaced by abi-codegen after backend compiles. */

import { MeroJs } from '@calimero-network/mero-react';

export interface InvitationView {
  id: string;
  code: string;
  creatorId: string;
  accepted: boolean;
  acceptorId: string;
  createdAt: number;
}

export interface MessageView {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export class SimplechatClient {
  private mero: MeroJs;
  private contextId: string;
  private executorPublicKey: string;

  constructor(mero: MeroJs, contextId: string, executorPublicKey: string) {
    this.mero = mero;
    this.contextId = contextId;
    this.executorPublicKey = executorPublicKey;
  }

  /**
   * create_invitation
   */
  public async createInvitation(params: { creatorId: string }): Promise<string> {
    const response = await this.mero.rpc.execute({ contextId: this.contextId, method: 'create_invitation', argsJson: params, executorPublicKey: this.executorPublicKey });
    return response as string;
  }

  /**
   * accept_invitation
   */
  public async acceptInvitation(params: { code: string; acceptorId: string }): Promise<string> {
    const response = await this.mero.rpc.execute({ contextId: this.contextId, method: 'accept_invitation', argsJson: params, executorPublicKey: this.executorPublicKey });
    return response as string;
  }

  /**
   * send_message
   */
  public async sendMessage(params: { chatId: string; senderId: string; text: string }): Promise<void> {
    const response = await this.mero.rpc.execute({ contextId: this.contextId, method: 'send_message', argsJson: params, executorPublicKey: this.executorPublicKey });
    return response as void;
  }

  /**
   * get_messages
   */
  public async getMessages(params: { chatId: string }): Promise<MessageView[]> {
    const response = await this.mero.rpc.execute({ contextId: this.contextId, method: 'get_messages', argsJson: params, executorPublicKey: this.executorPublicKey });
    return response as MessageView[];
  }

  /**
   * get_invitation
   */
  public async getInvitation(params: { code: string }): Promise<InvitationView> {
    const response = await this.mero.rpc.execute({ contextId: this.contextId, method: 'get_invitation', argsJson: params, executorPublicKey: this.executorPublicKey });
    return response as InvitationView;
  }
}
