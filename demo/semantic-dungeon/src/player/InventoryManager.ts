import { PlayerState, EquipmentSlots } from '../types';

export class InventoryManager {
    /**
     * Determine the equipment slot for a given item name using strict heuristics.
     */
    static getSlotForItem(itemName: string): keyof EquipmentSlots | null {
        const lower = itemName.toLowerCase();

        // Weapons
        if (this.matchesAny(lower, ['sword', 'axe', 'mace', 'dagger', 'staff', 'wand', 'spear', 'blade', 'club', 'bow', 'greatsword', 'hammer'])) return 'mainHand';

        // Off-hand
        if (this.matchesAny(lower, ['shield', 'buckler', 'orb', 'torch', 'tome', 'scutum', 'aegis'])) return 'offHand';

        // Headgear
        if (this.matchesAny(lower, ['helm', 'hat', 'cap', 'crown', 'hood', 'mask', 'visor', 'circlet'])) return 'head';

        // Armor
        if (this.matchesAny(lower, ['armor', 'robe', 'plate', 'mail', 'tunic', 'vest', 'shirt', 'cloak', 'cuirass', 'gambeson'])) return 'chest';

        return null;
    }

    private static matchesAny(text: string, keywords: string[]): boolean {
        return keywords.some(k => text.includes(k));
    }

    /**
     * Equip an item from inventory to the appropriate slot.
     * Swaps with existing item if slot is occupied.
     */
    static equipItem(player: PlayerState, itemIndex: number): { success: boolean, message: string } {
        const item = player.inventory[itemIndex];
        if (!item) return { success: false, message: "Item not found." };

        const slot = this.getSlotForItem(item);
        if (!slot) {
            return { success: false, message: `Cannot determine equipment slot for '${item}'.` };
        }

        // Unequip current if exists
        const currentEquipped = player.equipment[slot];
        if (currentEquipped) {
            player.inventory.push(currentEquipped);
        }

        // Equip new
        player.equipment[slot] = item;

        // Remove from inventory
        player.inventory.splice(itemIndex, 1);

        return { success: true, message: `Equipped ${item} to ${slot}.` };
    }

    /**
     * Unequip an item from a slot into inventory.
     */
    static unequipItem(player: PlayerState, slot: keyof EquipmentSlots): { success: boolean, message: string } {
        const item = player.equipment[slot];
        if (!item) return { success: false, message: "Slot is empty." };

        player.inventory.push(item);
        player.equipment[slot] = null;

        return { success: true, message: `Unequipped ${item}.` };
    }

    /**
     * Use a consumable item.
     */
    static useItem(player: PlayerState, itemIndex: number): { success: boolean, message: string } {
        const item = player.inventory[itemIndex];
        if (!item) return { success: false, message: "Item not found." };

        // Simple consumption logic
        player.inventory.splice(itemIndex, 1);
        return { success: true, message: `You used ${item}. It had a mysterious effect.` };
    }
}
