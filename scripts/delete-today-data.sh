#!/bin/bash

# Delete today's data for regeneration
# Usage: ./scripts/delete-today-data.sh

TODAY=$(date +%Y-%m-%d)
PROJECT="personal-primer"

echo ""
echo "Deleting all data for $TODAY..."
echo ""

# Delete bundle
echo "Deleting bundle..."
firebase firestore:delete --project $PROJECT "dailyBundles/$TODAY" --force 2>/dev/null && echo "✓ Deleted bundle: $TODAY" || echo "- No bundle found"

# Delete conversation
echo "Deleting conversation..."
firebase firestore:delete --project $PROJECT "conversations/$TODAY" --force 2>/dev/null && echo "✓ Deleted conversation: $TODAY" || echo "- No conversation found"

# Delete session insights
echo "Deleting session insights..."
firebase firestore:delete --project $PROJECT "sessionInsights/$TODAY" --force 2>/dev/null && echo "✓ Deleted session insights: $TODAY" || echo "- No session insights found"

# Note: exposures have auto-generated IDs and can't be deleted via CLI without querying
echo ""
echo "⚠️  Exposures must be deleted manually in Firebase Console:"
echo "   https://console.firebase.google.com/project/$PROJECT/firestore/databases/-default-/data/~2Fexposures"
echo "   Filter by dateShown = $TODAY and delete matching documents."
echo ""
echo "Done. Refresh the app to regenerate today's bundle."
echo ""
