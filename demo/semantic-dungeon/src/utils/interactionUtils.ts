
import { TileType } from '../dungeon/DungeonGenerator';
import { MechanicsLog } from '../entities/TileCollapser';

/**
 * Standardized internal interface for interaction results from ANY source (Object or Tile).
 * This allows specific Collapsers to return raw data without worrying about UI formatting.
 */
export interface SimulatedInteraction {
    message: string;
    items: string[];
    outcome: 'steady' | 'modified' | 'destroyed';
    mechanics?: MechanicsLog;
    semanticAction?: 'pickup' | 'unlock' | 'open' | 'other';
}

/**
 * The final shape consumed by the UI (InspectionModal).
 * Note: This duplicates InspectionResult from TileCollapser temporarily to avoid circular deps during refactor.
 * TODO: Move InspectionResult to a shared types file.
 */
export interface UIInteractionResult {
    success: boolean;
    tileType: TileType;
    description: string; // The primary narrative text
    isObject: boolean;
    objectType?: string;
    wasAlreadyCollapsed: boolean;

    // Semantic fields
    semanticAction?: 'pickup' | 'unlock' | 'open' | 'other';
    items?: string[];
    item?: string; // Legacy support

    // State fields
    outcome?: 'steady' | 'modified' | 'destroyed';
    generatedItems?: string[];
    mechanics?: MechanicsLog;
}

/**
 * Pure function to build the final UI result from a simulation.
 * UNIFIES the path for Object interactions and Tile interactions.
 */
export function buildInteractionResult(
    simulation: SimulatedInteraction,
    context: {
        tileType: TileType;
        isObject: boolean;
        objectType?: string;
        wasAlreadyCollapsed: boolean;
    }
): UIInteractionResult {
    // 1. Determine Semantic Action (if not explicitly provided)
    let finalAction = simulation.semanticAction;

    // Auto-detect 'pickup' if items were generated but no action specified
    if (!finalAction && simulation.items && simulation.items.length > 0) {
        finalAction = 'pickup';
    }

    // 2. Construct final object
    return {
        success: true,
        tileType: context.tileType,
        description: simulation.message,
        isObject: context.isObject,
        objectType: context.objectType,
        wasAlreadyCollapsed: context.wasAlreadyCollapsed,

        // Semantic mapping
        semanticAction: finalAction,
        items: simulation.items,
        item: simulation.items && simulation.items.length > 0 ? simulation.items[0] : undefined,

        // State mapping
        outcome: simulation.outcome,
        generatedItems: simulation.items,
        mechanics: simulation.mechanics
    };
}
