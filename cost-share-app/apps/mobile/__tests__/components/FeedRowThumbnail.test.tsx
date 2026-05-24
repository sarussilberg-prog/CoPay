import React from 'react';
import { render } from '@testing-library/react-native';
import { FeedRowThumbnail } from '../../components/FeedRowThumbnail';

describe('FeedRowThumbnail', () => {
  it('renders an Image when imageUrl is provided', () => {
    const { getByTestId, queryByTestId } = render(
      <FeedRowThumbnail imageUrl="https://example.com/x.jpg" testID="thumb" />,
    );
    expect(getByTestId('thumb-image')).toBeTruthy();
    expect(queryByTestId('thumb-icon')).toBeNull();
  });

  it('renders an icon when no imageUrl is provided', () => {
    const { getByTestId, queryByTestId } = render(
      <FeedRowThumbnail iconName="restaurant-outline" testID="thumb" />,
    );
    expect(getByTestId('thumb-icon')).toBeTruthy();
    expect(queryByTestId('thumb-image')).toBeNull();
  });
});
